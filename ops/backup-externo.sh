#!/usr/bin/env bash
# Backup externo e criptografado. Leva o banco e
# os arquivos de negócio para fora da VPS, no formato de
# ops/backup-formato.md:
#
#   banco/plugga_os.dump  +  arquivos/<balde>/...  +  LEIAME.txt   ->  tar  ->  age  ->  B2
#
# Falha (e avisa o heartbeat) se: o banco ou todos os baldes de origem vierem
# vazios, um balde de origem não for lido, o envio falhar, ou o arquivo que
# chegou ao destino divergir do manifesto. Nenhuma chave vai para linha de
# comando: tudo passa por arquivo de ambiente (`--env-file`), nunca `-e CHAVE=...`.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); o cliente agora é o `aws-cli` oficial, que fala
# o mesmo S3 e funciona com qualquer servidor compatível (RustFS incluído).
# Sem alias único: cada papel (origem, destino, leitura) tem seu próprio
# endpoint/credencial/região, porque o `aws-cli` assina a requisição com a
# região configurada — diferente do `mc`, que não exigia isso.
#
# Arquivo de ambiente (BACKUP_EXTERNO_ENV, padrão /root/.plugga-backup-externo.env, modo 600):
#   ORIGEM_ENDPOINT        endpoint do armazenamento local (S3), com a chave de LEITURA dos baldes
#   ORIGEM_ACCESS_KEY      chave de leitura dos baldes de origem
#   ORIGEM_SECRET_KEY
#   ORIGEM_REGIAO          (opcional) padrão us-east-1; o armazenamento local não valida região
#   DESTINO_ENDPOINT       endpoint do B2 (https://s3.<região>.backblazeb2.com)
#   DESTINO_REGIAO         região do B2 (obrigatória: o B2 valida a assinatura pela região)
#   DESTINO_ACCESS_KEY     chave de ESCRITA do B2
#   DESTINO_SECRET_KEY
#   DESTINO_BALDE          balde do B2
#   DESTINO_LEITURA_ACCESS_KEY (opcional) chave de leitura do B2: liga a conferência por releitura
#   DESTINO_LEITURA_SECRET_KEY (opcional)
#   HEARTBEAT_URL          (opcional) URL de ping; sucesso nela, falha em <URL>/fail
#
# Variáveis de substituição (testes e ambientes sem Docker):
#   BACKUP_DUMP_CMD   comando que escreve o pg_dump -Fc no stdout
#   BACKUP_SQL_CMD    comando que lê SQL no stdin e devolve linhas "tabela|contagem" (psql -A -t)
#   BACKUP_AWSCLI     comando do `aws` (padrão: docker run amazon/aws-cli --rm -i --env-file);
#                     enxerga o diretório de trabalho como /trabalho
#   BACKUP_CURL       comando do curl (padrão: curl)
#   BACKUP_DIR_TRABALHO  diretório de trabalho (padrão: mktemp)
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV_ARQ=${BACKUP_EXTERNO_ENV:-/root/.plugga-backup-externo.env}
RECEPTORES=${BACKUP_RECEPTORES:-$RAIZ/ops/backup/age-recipients.txt}
LISTA_BALDES=${BACKUP_BALDES:-$RAIZ/ops/backup/baldes.txt}
REDE=${REDE:-plugga-os_default}
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
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
: "${ORIGEM_ENDPOINT:?defina ORIGEM_ENDPOINT em $ENV_ARQ}"
: "${ORIGEM_ACCESS_KEY:?defina ORIGEM_ACCESS_KEY em $ENV_ARQ}"
: "${ORIGEM_SECRET_KEY:?defina ORIGEM_SECRET_KEY em $ENV_ARQ}"
: "${DESTINO_ENDPOINT:?defina DESTINO_ENDPOINT em $ENV_ARQ}"
: "${DESTINO_REGIAO:?defina DESTINO_REGIAO em $ENV_ARQ}"
: "${DESTINO_ACCESS_KEY:?defina DESTINO_ACCESS_KEY em $ENV_ARQ}"
: "${DESTINO_SECRET_KEY:?defina DESTINO_SECRET_KEY em $ENV_ARQ}"
: "${DESTINO_BALDE:?defina DESTINO_BALDE em $ENV_ARQ}"
ORIGEM_REGIAO=${ORIGEM_REGIAO:-us-east-1}
HEARTBEAT_URL=${HEARTBEAT_URL:-}

# Pelo menos dois destinatários (dono e teste): com um só, perder a chave perde o backup.
DESTINATARIOS=$(grep -E '^age1' "$RECEPTORES" || true)
[ "$(printf '%s\n' "$DESTINATARIOS" | grep -c '^age1' || true)" -ge 2 ] \
  || falha "$RECEPTORES precisa de ao menos 2 destinatários (dono e teste)"

# ------------------------------------------------------- aws-cli sem chave em argv
# Um arquivo de ambiente por papel: cada chamada assina com a credencial e a
# região do papel que está falando (origem, destino ou leitura), nunca `-e`.
AWS_ENV_ORIGEM="$TMP/aws-origem.env"
AWS_ENV_DESTINO="$TMP/aws-destino.env"
AWS_ENV_LEITURA="$TMP/aws-leitura.env"
(
  umask 077
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=%s\n' \
    "$ORIGEM_ACCESS_KEY" "$ORIGEM_SECRET_KEY" "$ORIGEM_REGIAO" >"$AWS_ENV_ORIGEM"
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=%s\n' \
    "$DESTINO_ACCESS_KEY" "$DESTINO_SECRET_KEY" "$DESTINO_REGIAO" >"$AWS_ENV_DESTINO"
  if [ -n "${DESTINO_LEITURA_ACCESS_KEY:-}" ]; then
    printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=%s\n' \
      "$DESTINO_LEITURA_ACCESS_KEY" "$DESTINO_LEITURA_SECRET_KEY" "$DESTINO_REGIAO" >"$AWS_ENV_LEITURA"
  fi
)
aws_chamar() { # $1 = endpoint ; $2 = arquivo de ambiente ; resto = args do aws
  local endpoint=$1 envfile=$2
  shift 2
  if [ -n "${BACKUP_AWSCLI:-}" ]; then
    # shellcheck disable=SC1090
    (set -a; . "$envfile"; set +a; ${BACKUP_AWSCLI} "$@" --endpoint-url "$endpoint" </dev/null)
  else
    docker run --rm -i --network "$REDE" --env-file "$envfile" -v "$TMP:/trabalho" "$AWSCLI_IMAGEM" \
      "$@" --endpoint-url "$endpoint" </dev/null
  fi
}
aws_origem()  { aws_chamar "$ORIGEM_ENDPOINT" "$AWS_ENV_ORIGEM" "$@"; }
aws_destino() { aws_chamar "$DESTINO_ENDPOINT" "$AWS_ENV_DESTINO" "$@"; }
aws_leitura() { aws_chamar "$DESTINO_ENDPOINT" "$AWS_ENV_LEITURA" "$@"; }

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
  listagem=$(aws_origem s3api list-objects-v2 --bucket "$balde" --query 'Contents[].[Key,Size]' --output text) \
    || falha "não consegui ler o balde de origem $balde"
  if [ "$listagem" = "None" ]; then
    objetos=0
    bytes=0
  else
    objetos=$(printf '%s\n' "$listagem" | grep -c . || true)
    bytes=$(printf '%s\n' "$listagem" | awk -F'\t' '{s+=$2} END {print s+0}')
  fi
  if [ "$objetos" -gt 0 ]; then
    aws_origem s3 sync --quiet "s3://$balde" "/trabalho/conteudo/arquivos/$balde" >/dev/null \
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
  aws_destino s3 cp --quiet "/trabalho/$NOME.tar.age" "s3://$DESTINO_BALDE/$prefixo/$NOME.tar.age" >/dev/null \
    || falha "o envio do arquivo para $prefixo falhou"
  aws_destino s3 cp --quiet "/trabalho/$NOME.manifesto.json" "s3://$DESTINO_BALDE/$prefixo/$NOME.manifesto.json" >/dev/null \
    || falha "o envio do manifesto para $prefixo falhou"
}
envia "diario/$ANO/$MES"
if [ "$DIA" = "01" ]; then envia "mensal/$ANO"; fi

# O que chegou tem de ser o que saiu: tamanho sempre; SHA-256 por releitura
# quando a chave de leitura está no ambiente (a de escrita não lê).
STAT=$(aws_destino s3api head-object --bucket "$DESTINO_BALDE" --key "diario/$ANO/$MES/$NOME.tar.age") \
  || falha "o arquivo enviado não aparece no destino"
TAMANHO_DESTINO=$(printf '%s' "$STAT" | sed -n 's/.*"ContentLength": *\([0-9][0-9]*\).*/\1/p')
[ "${TAMANHO_DESTINO:-0}" = "$BYTES" ] \
  || falha "tamanho no destino (${TAMANHO_DESTINO:-0}) diferente do manifesto ($BYTES)"
if [ -n "${DESTINO_LEITURA_ACCESS_KEY:-}" ]; then
  SHA_DESTINO=$(aws_leitura s3 cp "s3://$DESTINO_BALDE/diario/$ANO/$MES/$NOME.tar.age" - | sha256sum | awk '{print $1}')
  [ "$SHA_DESTINO" = "$SHA" ] || falha "SHA-256 no destino diferente do manifesto"
else
  registro "sem chave de leitura no ambiente: SHA-256 conferido só no restaurar-teste semanal"
fi

printf '✓ backup externo ok: diario/%s/%s/%s.tar.age (%s bytes, %s tabelas, %s objetos)\n' \
  "$ANO" "$MES" "$NOME" "$BYTES" "$TABELAS" "$OBJETOS_TOTAL"
ping ""
