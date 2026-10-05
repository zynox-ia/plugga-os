#!/usr/bin/env bash
#
# Prova que o backup restaura (FR-016, constituição VI). É o "backup restaurado
# antes" exigido de toda tarefa que mexe na VPS: restaura o dump mais recente num
# Postgres DESCARTÁVEL e confere que o banco voltou com tabelas. Nunca toca o
# banco de produção.
#
# Uso:
#   ops/restaurar-teste.sh                 # na VPS: baixa o dump mais recente do balde plugga-backups
#   ops/restaurar-teste.sh ARQUIVO|PASTA   # restaura um dump local (ou o mais recente de uma pasta)
#   ops/restaurar-teste.sh --externo       # baixa o backup externo mais recente do B2 (chave de leitura) e restaura o pacote
#   ops/restaurar-teste.sh PACOTE.tar.age  # restaura um pacote do backup externo já baixado (com o .manifesto.json ao lado)
#
# Pacote do backup externo (T053): confere tamanho e SHA-256 contra o manifesto,
# decifra com a chave de TESTE (RESTAURA_CHAVE_AGE, arquivo de identidade age),
# restaura o banco, confere a contagem de linhas por tabela e de objetos por balde
# contra o manifesto, e registra o resultado. Qualquer divergência sai com erro.
#
# Variáveis:
#   RESTAURA_MODO      docker (padrão): sobe um contêiner postgres:16 descartável
#                      servidor: usa um Postgres já no ar (RESTAURA_PGHOST/PORT/USER) e
#                                cria e apaga um banco descartável nele (testes e CI)
#   RESTAURA_TABELAS_MINIMO  mínimo de tabelas no schema public após restaurar (padrão 1)
#   RESTAURA_PGHOST, RESTAURA_PGPORT, RESTAURA_PGUSER  só no modo servidor
#   RESTAURA_CHAVE_AGE  identidade age de teste, para decifrar o pacote externo
#   RESTAURA_REGISTRO   arquivo onde anexar o resultado (padrão /var/log/plugga-restaura-teste.log; se não der, só a tela)
#   BACKUP_EXTERNO_ENV  ambiente do backup externo; para --externo precisa de DESTINO_LEITURA_URL e DESTINO_BALDE;
#                       HEARTBEAT_RESTAURA_URL (opcional): ping de sucesso e <URL>/fail em erro
#   BACKUP_MC, BACKUP_CURL, BACKUP_DIR_TRABALHO  substitutos do mc, do curl e da pasta de trabalho (testes)
#
# Sai com erro (e mensagem) se: o dump não existe ou está vazio, o pg_restore
# falha (dump adulterado ou truncado), ou o banco volta com tabelas de menos.
set -euo pipefail

PG_IMAGEM=${RESTAURA_PG_IMAGEM:-postgres:16-alpine}
MODO=${RESTAURA_MODO:-docker}
MINIMO=${RESTAURA_TABELAS_MINIMO:-1}
ORIGEM=${1:-}
TMP=${BACKUP_DIR_TRABALHO:-$(mktemp -d)}
mkdir -p "$TMP"
chmod 700 "$TMP"
ENV_ARQ=${BACKUP_EXTERNO_ENV:-/root/.plugga-backup-externo.env}
REGISTRO_ARQ=${RESTAURA_REGISTRO:-/var/log/plugga-restaura-teste.log}
HEARTBEAT_URL=""
MANIFESTO=""
PACOTE_DIR=""
ORIGEM_DESCRICAO=""
REDE=${REDE:-plugga-os_default}
MC_IMAGEM=${MC_IMAGEM:-minio/mc:RELEASE.2025-04-16T18-13-26Z}
CONTEINER=""
BANCO_TESTE="restauracao_$(date -u +%Y%m%d%H%M%S)_$$"

registro() { printf '▸ %s\n' "$*"; }

ping() {
  [ -n "$HEARTBEAT_URL" ] || return 0
  printf 'url = "%s%s"\n' "$HEARTBEAT_URL" "$1" | ${BACKUP_CURL:-curl} -fsS -m 10 -K - >/dev/null 2>&1 \
    || printf '! o heartbeat não respondeu (a restauração em si não foi afetada)\n' >&2
}

anota() {
  # Resultado fica no registro e na tela; se o registro não for gravável, só na tela.
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$REGISTRO_ARQ" 2>/dev/null || true
}

falha() {
  printf '✗ %s\n' "$*" >&2
  anota "FALHA ${ORIGEM_DESCRICAO:-sem origem}: $*"
  ping /fail
  exit 1
}

limpa() {
  if [ -n "$CONTEINER" ]; then docker rm -f "$CONTEINER" >/dev/null 2>&1 || true; fi
  if [ "$MODO" = "servidor" ]; then
    psql_servidor postgres -c "DROP DATABASE IF EXISTS \"$BANCO_TESTE\"" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap limpa EXIT

psql_servidor() {
  local banco=$1
  shift
  psql -h "${RESTAURA_PGHOST:?defina RESTAURA_PGHOST}" -p "${RESTAURA_PGPORT:-5432}" \
    -U "${RESTAURA_PGUSER:-postgres}" -d "$banco" -v ON_ERROR_STOP=1 -X -q -A -t "$@"
}

# --------------------------------------------------------------- 1. o dump
escolhe_dump() {
  if [ -z "$ORIGEM" ]; then
    # Padrão da VPS: o mais recente de plugga-backups/diario, com a credencial restrita do backup.
    # shellcheck disable=SC1091
    . /root/.plugga-backup.env
    local rede=${REDE:-plugga-os_default} mc=${MC_IMAGEM:-minio/mc:RELEASE.2025-04-16T18-13-26Z}
    local mcx=(docker run --rm -i --network "$rede" -e "MC_HOST_b=http://${BACKUP_ACCESS_KEY}:${BACKUP_SECRET_KEY}@seaweedfs:8333" "$mc")
    local nome
    nome=$("${mcx[@]}" ls "b/plugga-backups/diario/" | awk '{print $NF}' | grep '\.dump$' | sort | tail -1 || true)
    [ -n "$nome" ] || falha "não há dump em plugga-backups/diario"
    "${mcx[@]}" cat "b/plugga-backups/diario/$nome" >"$TMP/origem.dump"
    echo "$TMP/origem.dump"
  elif [ -d "$ORIGEM" ]; then
    local mais_recente
    mais_recente=$(ls -t "$ORIGEM"/*.dump 2>/dev/null | head -1 || true)
    [ -n "$mais_recente" ] || falha "a pasta $ORIGEM não tem nenhum .dump"
    echo "$mais_recente"
  else
    echo "$ORIGEM"
  fi
}

# ------------------------------------------- 1b. pacote do backup externo
mc_externo() {
  if [ -n "${BACKUP_MC:-}" ]; then
    # shellcheck disable=SC2086
    ${BACKUP_MC} "$@" </dev/null
  else
    docker run --rm -i --network "$REDE" --env-file "$TMP/mc.env" -v "$TMP:/trabalho" "$MC_IMAGEM" "$@" </dev/null
  fi
}

carrega_ambiente_externo() {
  [ -r "$ENV_ARQ" ] || falha "arquivo de ambiente ausente ou ilegível: $ENV_ARQ"
  # shellcheck disable=SC1090
  . "$ENV_ARQ"
  HEARTBEAT_URL=${HEARTBEAT_RESTAURA_URL:-}
}

baixa_externo() { # roda em subshell: só escreve o caminho no stdout
  : "${DESTINO_LEITURA_URL:?defina DESTINO_LEITURA_URL em $ENV_ARQ (a restauração lê com a chave de leitura)}"
  : "${DESTINO_BALDE:?defina DESTINO_BALDE em $ENV_ARQ}"
  (
    umask 077
    printf 'MC_HOST_leitura=%s\n' "$DESTINO_LEITURA_URL" >"$TMP/mc.env"
  )
  local nome
  nome=$(mc_externo ls --recursive --json "leitura/$DESTINO_BALDE/diario" \
    | sed -n 's/.*"key":"\([^"]*\.tar\.age\)".*/\1/p' | sort | tail -1 || true)
  [ -n "$nome" ] || falha "não há backup externo em $DESTINO_BALDE/diario"
  registro "baixando o mais recente: $nome" >&2
  mkdir -p "$TMP/baixado"
  mc_externo cp --quiet "leitura/$DESTINO_BALDE/diario/$nome" "/trabalho/baixado/$(basename "$nome")" >/dev/null \
    || falha "não consegui baixar $nome"
  mc_externo cp --quiet "leitura/$DESTINO_BALDE/diario/${nome%.tar.age}.manifesto.json" \
    "/trabalho/baixado/$(basename "${nome%.tar.age}").manifesto.json" >/dev/null \
    || falha "não consegui baixar o manifesto de $nome"
  echo "$TMP/baixado/$(basename "$nome")"
}

# Extrai do manifesto os pares "chave": número de um bloco de uma linha.
manifesto_pares() { # $1 = chave do bloco
  sed -n "s/.*\"$1\": *{ *\(.*\) *}.*/\1/p" "$MANIFESTO" | head -1 | grep -o '"[^"]*": *[0-9]*' | sed 's/"\([^"]*\)": */\1|/' || true
}

prepara_pacote() { # $1 = .tar.age ; define DUMP e PACOTE_DIR
  local pacote=$1
  MANIFESTO="${pacote%.tar.age}.manifesto.json"
  [ -s "$pacote" ] || falha "pacote vazio ou ausente: $pacote"
  [ -r "$MANIFESTO" ] || falha "manifesto não encontrado ao lado do pacote: $MANIFESTO"
  [ -n "${RESTAURA_CHAVE_AGE:-}" ] && [ -r "$RESTAURA_CHAVE_AGE" ] \
    || falha "defina RESTAURA_CHAVE_AGE com a identidade age de teste (arquivo legível)"
  local sha_esperado bytes_esperados sha_real bytes_reais
  sha_esperado=$(sed -n 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/p' "$MANIFESTO" | head -1)
  bytes_esperados=$(sed -n 's/.*"bytes": *\([0-9][0-9]*\), *"sha256".*/\1/p' "$MANIFESTO" | head -1)
  [ -n "$sha_esperado" ] || falha "o manifesto não traz o SHA-256 do arquivo"
  bytes_reais=$(wc -c <"$pacote" | tr -d ' ')
  [ -z "$bytes_esperados" ] || [ "$bytes_reais" = "$bytes_esperados" ] \
    || falha "tamanho do pacote ($bytes_reais) diferente do manifesto ($bytes_esperados)"
  sha_real=$(sha256sum "$pacote" | awk '{print $1}')
  [ "$sha_real" = "$sha_esperado" ] || falha "SHA-256 do pacote diferente do manifesto: o arquivo foi alterado ou corrompido"
  registro "SHA-256 e tamanho conferem com o manifesto"
  mkdir -p "$TMP/pacote"
  age -d -i "$RESTAURA_CHAVE_AGE" "$pacote" >"$TMP/pacote.tar" \
    || falha "não consegui decifrar o pacote com a chave de teste"
  tar -C "$TMP/pacote" -xf "$TMP/pacote.tar" || falha "o tar do pacote está corrompido"
  rm -f "$TMP/pacote.tar"
  PACOTE_DIR="$TMP/pacote"
  [ -f "$PACOTE_DIR/banco/plugga_os.dump" ] || falha "o pacote não traz banco/plugga_os.dump"
  DUMP="$PACOTE_DIR/banco/plugga_os.dump"
}

if [ "$ORIGEM" = "--externo" ]; then
  carrega_ambiente_externo
  ORIGEM=$(baixa_externo)
elif [ "${ORIGEM%.tar.age}" != "$ORIGEM" ] && [ -r "$ENV_ARQ" ]; then
  carrega_ambiente_externo
fi
ORIGEM_DESCRICAO=${ORIGEM:+$(basename "$ORIGEM")}

DUMP=""
case "$ORIGEM" in
  *.tar.age) prepara_pacote "$ORIGEM" ;;
  *) DUMP=$(escolhe_dump) ;;
esac
[ -f "$DUMP" ] || falha "dump não encontrado: $DUMP"
[ -s "$DUMP" ] || falha "dump vazio: $DUMP (origem sem dados não é backup)"
registro "restaurando $(basename "$DUMP") ($(wc -c <"$DUMP") bytes)"

# ---------------------------------------------------- 2. restaurar e contar
if [ "$MODO" = "docker" ]; then
  CONTEINER=$(docker run -d --rm -e POSTGRES_PASSWORD="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
    --network none "$PG_IMAGEM")
  for _ in $(seq 1 40); do
    docker exec "$CONTEINER" pg_isready -U postgres >/dev/null 2>&1 && pronto=1 && break
    sleep 1
  done
  [ "${pronto:-0}" = 1 ] || falha "o Postgres descartável não ficou pronto"
  docker exec "$CONTEINER" createdb -U postgres "$BANCO_TESTE"
  docker cp "$DUMP" "$CONTEINER:/tmp/restaurar.dump"
  docker exec "$CONTEINER" pg_restore -U postgres -d "$BANCO_TESTE" --no-owner --exit-on-error /tmp/restaurar.dump \
    || falha "pg_restore falhou: o dump está corrompido ou incompleto"
  TABELAS=$(docker exec "$CONTEINER" psql -U postgres -d "$BANCO_TESTE" -X -A -t \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
elif [ "$MODO" = "servidor" ]; then
  psql_servidor postgres -c "CREATE DATABASE \"$BANCO_TESTE\"" >/dev/null
  pg_restore -h "${RESTAURA_PGHOST}" -p "${RESTAURA_PGPORT:-5432}" -U "${RESTAURA_PGUSER:-postgres}" \
    -d "$BANCO_TESTE" --no-owner --exit-on-error "$DUMP" \
    || falha "pg_restore falhou: o dump está corrompido ou incompleto"
  TABELAS=$(psql_servidor "$BANCO_TESTE" \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
else
  falha "RESTAURA_MODO desconhecido: $MODO (use docker ou servidor)"
fi

TABELAS=$(printf '%s' "$TABELAS" | tr -d '[:space:]')
[ "${TABELAS:-0}" -ge "$MINIMO" ] || falha "o banco restaurado tem $TABELAS tabela(s); o mínimo é $MINIMO"

# ------------------------------------- 3. conferência com o manifesto (pacote)
sql_restaurado() { # SQL no stdin, linhas no stdout
  if [ "$MODO" = "docker" ]; then
    docker exec -i "$CONTEINER" psql -U postgres -d "$BANCO_TESTE" -X -A -t
  else
    psql_servidor "$BANCO_TESTE"
  fi
}

DETALHE=""
if [ -n "$MANIFESTO" ]; then
  SQL_CONTAGENS="SELECT table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
  REAIS=$(printf '%s\n' "$SQL_CONTAGENS" | sql_restaurado | sort)
  ESPERADAS=$(manifesto_pares linhasPorTabela | sort)
  [ -n "$ESPERADAS" ] || falha "o manifesto não traz linhasPorTabela"
  if [ "$REAIS" != "$ESPERADAS" ]; then
    printf '%s\n' "esperado (manifesto) x restaurado:" >&2
    diff <(printf '%s\n' "$ESPERADAS") <(printf '%s\n' "$REAIS") >&2 || true
    falha "a contagem de linhas por tabela diverge do manifesto"
  fi
  LINHAS=$(printf '%s\n' "$REAIS" | awk -F'|' 'NF==2 {s+=$2} END {print s+0}')

  # Arquivos: objetos por balde no pacote x manifesto.
  OBJETOS=0
  BALDES_N=0
  while IFS= read -r par; do
    [ -n "$par" ] || continue
    balde=${par%%|*}
    esperado=${par#*|}
    real=0
    [ ! -d "$PACOTE_DIR/arquivos/$balde" ] || real=$(find "$PACOTE_DIR/arquivos/$balde" -type f | wc -l | tr -d ' ')
    [ "$real" = "$esperado" ] || falha "o balde $balde tem $real objeto(s) no pacote; o manifesto diz $esperado"
    OBJETOS=$((OBJETOS + real))
    BALDES_N=$((BALDES_N + 1))
  done < <(sed -n 's/.*"baldes": *{ *\(.*\) *} *}.*/\1/p' "$MANIFESTO" | head -1 \
    | grep -o '"[^"]*": *{ *"objetos": *[0-9]*' | sed 's/"\([^"]*\)": *{ *"objetos": */\1|/')
  [ "$BALDES_N" -ge 1 ] || falha "o manifesto não traz baldes"
  DETALHE=", $LINHAS linhas conferidas com o manifesto, $OBJETOS objetos em $BALDES_N baldes"
fi

printf '✓ restauração ok: %s tabelas no schema public%s\n' "$TABELAS" "$DETALHE"
anota "OK ${ORIGEM_DESCRICAO:-dump}: $TABELAS tabelas$DETALHE"
ping ""
