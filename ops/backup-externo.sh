#!/usr/bin/env bash
#
# Backup externo e criptografado (spec 002, US3, FR-011/012/015). Leva o banco e
# os arquivos de negócio para fora da VPS, no formato de
# specs/002-fundacao-solida/contracts/backup-formato.md:
#
#   banco/plugga_os.dump  +  arquivos/<balde>/...  +  LEIAME.txt   ->  tar  ->  age  ->  B2
#
# Falha (e avisa o heartbeat) se: o banco ou todos os baldes de origem vierem
# vazios, um balde de origem não for lido, o envio falhar, ou o arquivo que
# chegou ao destino divergir do manifesto. Nenhuma chave vai para linha de
# comando: tudo passa por arquivo de ambiente (`--env-file`), nunca `-e CHAVE=...`.
#
# Arquivo de ambiente (BACKUP_EXTERNO_ENV, padrão /root/.plugga-backup-externo.env, modo 600):
#   ORIGEM_URL        MC_HOST do SeaweedFS com a chave de LEITURA dos baldes (http://chave:segredo@seaweedfs:8333)
#   DESTINO_URL       MC_HOST do B2 com a chave de ESCRITA (https://chave:segredo@s3.<região>.backblazeb2.com)
#   DESTINO_BALDE     balde do B2
#   DESTINO_LEITURA_URL (opcional) chave de leitura: liga a conferência por releitura do arquivo enviado
#   HEARTBEAT_URL     (opcional) URL de ping; sucesso nela, falha em <URL>/fail
#
# Variáveis de substituição (testes e ambientes sem Docker):
#   BACKUP_DUMP_CMD   comando que escreve o pg_dump -Fc no stdout
#   BACKUP_SQL_CMD    comando que lê SQL no stdin e devolve linhas "tabela|contagem" (psql -A -t)
#   BACKUP_MC         comando do `mc` (padrão: docker run minio/mc com --env-file); enxerga
#                     o diretório de trabalho como /trabalho
#   BACKUP_CURL       comando do curl (padrão: curl)
#   BACKUP_DIR_TRABALHO  diretório de trabalho (padrão: mktemp)
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV_ARQ=${BACKUP_EXTERNO_ENV:-/root/.plugga-backup-externo.env}
RECEPTORES=${BACKUP_RECEPTORES:-$RAIZ/ops/backup/age-recipients.txt}
LISTA_BALDES=${BACKUP_BALDES:-$RAIZ/ops/backup/baldes.txt}
REDE=${REDE:-plugga-os_default}
MC_IMAGEM=${MC_IMAGEM:-minio/mc:RELEASE.2025-04-16T18-13-26Z}
BANCO=${BACKUP_BANCO:-plugga_os}
AGORA=${BACKUP_AGORA:-$(date -u +%Y%m%dT%H%M%SZ)}

registro() { printf '▸ %s\n' "$*"; }

TMP=${BACKUP_DIR_TRABALHO:-$(mktemp -d)}
mkdir -p "$TMP"
chmod 700 "$TMP"
HEARTBEAT_URL=""

ping() {
  [ -n "$HEARTBEAT_URL" ] || return 0
  printf 'url = "%s%s"\n' "$HEARTBEAT_URL" "$1" | ${BACKUP_CURL:-curl} -fsS -m 10 -K - >/dev/null 2>&1 \
    || printf '! o heartbeat não respondeu (o backup em si não foi afetado)\n' >&2
}

falha() {
  printf '✗ backup externo FALHOU: %s\n' "$*" >&2
  ping /fail
  exit 1
}

limpa() { rm -rf "$TMP"; }
trap limpa EXIT
trap 'falha "erro inesperado na linha $LINENO"' ERR

[ -r "$ENV_ARQ" ] || falha "arquivo de ambiente ausente ou ilegível: $ENV_ARQ"
[ -r "$RECEPTORES" ] || falha "lista de destinatários age ausente: $RECEPTORES"
[ -r "$LISTA_BALDES" ] || falha "lista de baldes ausente: $LISTA_BALDES"
# shellcheck disable=SC1090
. "$ENV_ARQ"
: "${ORIGEM_URL:?defina ORIGEM_URL em $ENV_ARQ}"
: "${DESTINO_URL:?defina DESTINO_URL em $ENV_ARQ}"
: "${DESTINO_BALDE:?defina DESTINO_BALDE em $ENV_ARQ}"
HEARTBEAT_URL=${HEARTBEAT_URL:-}

# Pelo menos dois destinatários (dono e teste): com um só, perder a chave perde o backup.
DESTINATARIOS=$(grep -E '^age1' "$RECEPTORES" || true)
[ "$(printf '%s\n' "$DESTINATARIOS" | grep -c '^age1' || true)" -ge 2 ] \
  || falha "$RECEPTORES precisa de ao menos 2 destinatários (dono e teste)"

# ---------------------------------------------------------------- mc sem chave em argv
MC_ENV="$TMP/mc.env"
(
  umask 077
  {
    printf 'MC_HOST_origem=%s\n' "$ORIGEM_URL"
    printf 'MC_HOST_destino=%s\n' "$DESTINO_URL"
    [ -z "${DESTINO_LEITURA_URL:-}" ] || printf 'MC_HOST_leitura=%s\n' "$DESTINO_LEITURA_URL"
  } >"$MC_ENV"
)
if [ -n "${BACKUP_MC:-}" ]; then
  # shellcheck disable=SC2206
  MC_CMD=($BACKUP_MC)
else
  MC_CMD=(docker run --rm -i --network "$REDE" --env-file "$MC_ENV" -v "$TMP:/trabalho" "$MC_IMAGEM")
fi
mc() { "${MC_CMD[@]}" "$@" </dev/null; }

# ------------------------------------------------------------------ 1. o banco
registro "banco: dump e contagens"
mkdir -p "$TMP/conteudo/banco" "$TMP/conteudo/arquivos"
if [ -n "${BACKUP_DUMP_CMD:-}" ]; then
  bash -c "$BACKUP_DUMP_CMD" >"$TMP/conteudo/banco/plugga_os.dump"
else
  docker exec plugga-os-postgres-1 pg_dump -U "$BANCO" -d "$BANCO" -Fc >"$TMP/conteudo/banco/plugga_os.dump"
fi
[ -s "$TMP/conteudo/banco/plugga_os.dump" ] || falha "o dump do banco veio vazio"

SQL_CONTAGENS="SELECT table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
if [ -n "${BACKUP_SQL_CMD:-}" ]; then
  CONTAGENS=$(printf '%s\n' "$SQL_CONTAGENS" | bash -c "$BACKUP_SQL_CMD")
else
  CONTAGENS=$(printf '%s\n' "$SQL_CONTAGENS" | docker exec -i plugga-os-postgres-1 psql -U "$BANCO" -d "$BANCO" -X -A -t)
fi
TABELAS=$(printf '%s\n' "$CONTAGENS" | grep -c '|' || true)
LINHAS_TOTAL=$(printf '%s\n' "$CONTAGENS" | awk -F'|' 'NF==2 {s+=$2} END {print s+0}')
[ "$TABELAS" -ge 1 ] || falha "o banco de origem não tem tabelas"
[ "$LINHAS_TOTAL" -ge 1 ] || falha "o banco de origem está vazio (0 linhas)"

# ---------------------------------------------------------------- 2. os baldes
registro "arquivos: espelho dos baldes de negócio"
OBJETOS_TOTAL=0
JSON_BALDES=""
while IFS= read -r balde; do
  case "$balde" in '' | '#'*) continue ;; esac
  listagem=$(mc ls --recursive --json "origem/$balde") || falha "não consegui ler o balde de origem $balde"
  objetos=$(printf '%s\n' "$listagem" | grep -c '"type":"file"' || true)
  bytes=$(printf '%s\n' "$listagem" | sed -n 's/.*"size":\([0-9][0-9]*\).*/\1/p' | awk '{s+=$1} END {print s+0}')
  if [ "$objetos" -gt 0 ]; then
    mc mirror --quiet "origem/$balde" "/trabalho/conteudo/arquivos/$balde" >/dev/null \
      || falha "o espelho do balde $balde falhou"
  fi
  OBJETOS_TOTAL=$((OBJETOS_TOTAL + objetos))
  JSON_BALDES="${JSON_BALDES:+$JSON_BALDES, }\"$balde\": { \"objetos\": $objetos, \"bytes\": $bytes }"
done <"$LISTA_BALDES"
[ "$OBJETOS_TOTAL" -ge 1 ] || falha "todos os baldes de origem estão vazios"

# --------------------------------------------------- 3. tar, age e manifesto
cat >"$TMP/conteudo/LEIAME.txt" <<TXT
Backup externo do Plugga OS, formato 1, criado em $AGORA.
Conteúdo: banco/plugga_os.dump (pg_dump -Fc) e arquivos/<balde>/ (espelho dos baldes).
Restaurar: ops/restaurar-teste.sh, ou veja "Recuperação de desastre" em ops/GUIA.md.
TXT

NOME="plugga-os-${AGORA}"
tar -C "$TMP/conteudo" -cf "$TMP/$NOME.tar" .
AGE_ARGS=()
while IFS= read -r destinatario; do AGE_ARGS+=(-r "$destinatario"); done <<<"$DESTINATARIOS"
age "${AGE_ARGS[@]}" -o "$TMP/$NOME.tar.age" "$TMP/$NOME.tar"
# Libera o espaço: o tar em claro e o espelho não ficam no disco depois de cifrados.
rm -f "$TMP/$NOME.tar"
rm -rf "$TMP/conteudo"

SHA=$(sha256sum "$TMP/$NOME.tar.age" | awk '{print $1}')
BYTES=$(wc -c <"$TMP/$NOME.tar.age" | tr -d ' ')
LINHAS_JSON=$(printf '%s\n' "$CONTAGENS" | awk -F'|' 'NF==2 {printf "%s\"%s\": %s", (n++ ? ", " : ""), $1, $2}')
DEST_JSON=$(printf '%s\n' "$DESTINATARIOS" | awk '{printf "%s\"%s\"", (n++ ? ", " : ""), $1}')
VERSAO_GIT=$(git -C "$RAIZ" rev-parse HEAD 2>/dev/null || echo desconhecida)
CRIADO_EM="${AGORA:0:4}-${AGORA:4:2}-${AGORA:6:2}T${AGORA:9:2}:${AGORA:11:2}:${AGORA:13:2}Z"
cat >"$TMP/$NOME.manifesto.json" <<JSON
{
  "formato": 1,
  "criadoEm": "$CRIADO_EM",
  "versaoGit": "$VERSAO_GIT",
  "arquivo": { "nome": "$NOME.tar.age", "bytes": $BYTES, "sha256": "$SHA" },
  "banco": { "tabelas": $TABELAS, "linhasPorTabela": { $LINHAS_JSON } },
  "arquivos": { "baldes": { $JSON_BALDES } },
  "destinatarios": [ $DEST_JSON ]
}
JSON

# --------------------------------------------------------------- 4. o envio
ANO=${AGORA:0:4}
MES=${AGORA:4:2}
DIA=${AGORA:6:2}
registro "enviando $NOME.tar.age ($BYTES bytes)"
envia() {
  local prefixo=$1
  mc cp --quiet "/trabalho/$NOME.tar.age" "destino/$DESTINO_BALDE/$prefixo/$NOME.tar.age" >/dev/null \
    || falha "o envio do arquivo para $prefixo falhou"
  mc cp --quiet "/trabalho/$NOME.manifesto.json" "destino/$DESTINO_BALDE/$prefixo/$NOME.manifesto.json" >/dev/null \
    || falha "o envio do manifesto para $prefixo falhou"
}
envia "diario/$ANO/$MES"
if [ "$DIA" = "01" ]; then envia "mensal/$ANO"; fi

# O que chegou tem de ser o que saiu: tamanho sempre; SHA-256 por releitura
# quando a chave de leitura está no ambiente (a de escrita não lê).
STAT=$(mc stat --json "destino/$DESTINO_BALDE/diario/$ANO/$MES/$NOME.tar.age") \
  || falha "o arquivo enviado não aparece no destino"
TAMANHO_DESTINO=$(printf '%s' "$STAT" | sed -n 's/.*"size":\([0-9][0-9]*\).*/\1/p')
[ "${TAMANHO_DESTINO:-0}" = "$BYTES" ] \
  || falha "tamanho no destino (${TAMANHO_DESTINO:-0}) diferente do manifesto ($BYTES)"
if [ -n "${DESTINO_LEITURA_URL:-}" ]; then
  SHA_DESTINO=$(mc cat "leitura/$DESTINO_BALDE/diario/$ANO/$MES/$NOME.tar.age" | sha256sum | awk '{print $1}')
  [ "$SHA_DESTINO" = "$SHA" ] || falha "SHA-256 no destino diferente do manifesto"
else
  registro "sem chave de leitura no ambiente: SHA-256 conferido só no restaurar-teste semanal"
fi

printf '✓ backup externo ok: diario/%s/%s/%s.tar.age (%s bytes, %s tabelas, %s objetos)\n' \
  "$ANO" "$MES" "$NOME" "$BYTES" "$TABELAS" "$OBJETOS_TOTAL"
ping ""
