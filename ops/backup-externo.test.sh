#!/usr/bin/env bash
#
# Ensaio de ops/backup-externo.sh sem Docker, sem VPS e sem B2: o `aws` é um
# imitador que trabalha em pastas (origem/, destino/), o banco é um dump de
# mentira e o curl só registra a URL do heartbeat. Prova:
#   - caso feliz: arquivo .tar.age cifrado para os dois destinatários, manifesto
#     coerente com o arquivo, conteúdo certo ao decifrar;
#   - origem vazia (baldes ou banco) falha e nada chega ao destino;
#   - arquivo com tamanho ou SHA-256 diferente do manifesto falha;
#   - nenhuma chave aparece em argv (nem no `aws`, nem no `curl`);
#   - heartbeat: ping de sucesso no caso feliz, /fail nos demais.
# Precisa de `age` e `age-keygen`.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }
command -v age >/dev/null && command -v age-keygen >/dev/null || falha "precisa de age e age-keygen"

BIN="$TMP/bin"
mkdir -p "$BIN"

# --- aws de mentira: alias origem/ e destino/ (e leitura = destino) viram pastas.
# O papel é decidido pela AWS_ACCESS_KEY_ID (cada papel tem a sua, como no
# arquivo de ambiente de verdade), não por um alias: é assim que o aws-cli real
# decide com qual credencial assinar cada chamada.
cat >"$BIN/aws" <<'AWSBIN'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >>"$FAKE_LOG"
ARGS=("$@")

valor_de() { # $1 = --flag ; procura em ARGS
  local flag=$1 i
  for ((i = 0; i < ${#ARGS[@]}; i++)); do
    [ "${ARGS[$i]}" = "$flag" ] && { echo "${ARGS[$((i + 1))]}"; return; }
  done
}

extrai_posicionais() { # define POS[] a partir de ARGS[2..], pulando flags conhecidas
  POS=()
  local pular=0 a
  for a in "${ARGS[@]:2}"; do
    if [ "$pular" = 1 ]; then pular=0; continue; fi
    case "$a" in
      --quiet) ;;
      --endpoint-url) pular=1 ;;
      *) POS+=("$a") ;;
    esac
  done
}

mapeia() {
  case "$1" in
    /trabalho/*) echo "$BACKUP_DIR_TRABALHO/${1#/trabalho/}" ;;
    s3://*)
      local resto=${1#s3://}
      case "$AWS_ACCESS_KEY_ID" in
        chaveorigem) echo "$FAKE_ROOT/origem/$resto" ;;
        *) echo "$FAKE_ROOT/destino/$resto" ;;
      esac
      ;;
    *) echo "$1" ;;
  esac
}

servico=$1 operacao=$2
case "$servico $operacao" in
  "s3api list-objects-v2")
    balde=$(valor_de --bucket)
    dir="$FAKE_ROOT/origem/$balde"
    [ -d "$dir" ] || exit 1
    saida=$( (cd "$dir" && find . -type f | sed 's|^\./||' | while read -r f; do
      printf '%s\t%s\n' "$f" "$(wc -c <"$f" | tr -d ' ')"
    done) )
    [ -n "$saida" ] && printf '%s\n' "$saida" || echo None
    ;;
  "s3api head-object")
    balde=$(valor_de --bucket) chave=$(valor_de --key)
    arq="$FAKE_ROOT/destino/$balde/$chave"
    [ -f "$arq" ] || exit 1
    printf '{\n    "ContentLength": %s\n}\n' "$(wc -c <"$arq" | tr -d ' ')"
    ;;
  "s3 sync")
    extrai_posicionais
    origem=$(mapeia "${POS[0]}") destino=$(mapeia "${POS[1]}")
    mkdir -p "$destino"
    cp -r "$origem/." "$destino/"
    ;;
  "s3 cp")
    extrai_posicionais
    origem=${POS[0]} destino=${POS[1]}
    if [ "$destino" = "-" ]; then
      cat "$(mapeia "$origem")"
    else
      local_destino=$(mapeia "$destino")
      mkdir -p "$(dirname "$local_destino")"
      cp "$(mapeia "$origem")" "$local_destino"
      case "$destino" in
        s3://*.tar.age)
          [ "${FAKE_APENDA:-0}" != 1 ] || printf 'x' >>"$local_destino"
          [ "${FAKE_TROCA:-0}" != 1 ] || { printf 'Z' | dd of="$local_destino" bs=1 seek=20 conv=notrunc 2>/dev/null; }
          ;;
      esac
    fi
    ;;
  *) echo "aws de mentira: operação desconhecida: $servico $operacao" >&2; exit 2 ;;
esac
AWSBIN
cat >"$BIN/curl" <<'CURL'
#!/usr/bin/env bash
echo "args: $*" >>"$FAKE_LOG"
cat >>"$FAKE_PINGS"
CURL
chmod +x "$BIN/aws" "$BIN/curl"

# --- chaves age: dono e teste
age-keygen -o "$TMP/dono.key" 2>/dev/null
age-keygen -o "$TMP/teste.key" 2>/dev/null
{
  echo "# destinatários de teste"
  age-keygen -y "$TMP/dono.key"
  age-keygen -y "$TMP/teste.key"
} >"$TMP/recipients.txt"
age-keygen -y "$TMP/dono.key" >"$TMP/um-so.txt"

printf '# baldes de teste\nplugga-um\nwaze-dois\n' >"$TMP/baldes.txt"
printf 'plugga-um\nbalde-que-nao-existe\n' >"$TMP/baldes-ruim.txt"

# Ambiente com "segredos" reconhecíveis: nenhum pode aparecer em argv. Cada
# papel tem endpoint, chave e região próprios — o aws-cli assina com a região
# configurada, diferente do mc, que não exigia isso.
cat >"$TMP/backup.env" <<'ENV'
ORIGEM_ENDPOINT=http://rustfs:9000
ORIGEM_ACCESS_KEY=chaveorigem
ORIGEM_SECRET_KEY=SEGREDO_ORIGEM_ZZ
DESTINO_ENDPOINT=https://s3.exemplo.test
DESTINO_REGIAO=us-west-002
DESTINO_ACCESS_KEY=chavedestino
DESTINO_SECRET_KEY=SEGREDO_DESTINO_ZZ
DESTINO_LEITURA_ACCESS_KEY=chaveleitura
DESTINO_LEITURA_SECRET_KEY=SEGREDO_LEITURA_ZZ
DESTINO_BALDE=backups-externos
HEARTBEAT_URL=https://hc.exemplo.test/ping/SEGREDO_PING_ZZ
ENV

executa() {
  # $1 = pasta do cenário; o resto são variáveis extras (VAR=valor)
  local dir=$1
  shift
  env FAKE_ROOT="$dir/fake" FAKE_LOG="$dir/log" FAKE_PINGS="$dir/pings" BACKUP_DIR_TRABALHO="$dir/trab" \
    BACKUP_AWSCLI="$BIN/aws" BACKUP_CURL="$BIN/curl" \
    BACKUP_EXTERNO_ENV="$TMP/backup.env" BACKUP_RECEPTORES="$TMP/recipients.txt" BACKUP_BALDES="$TMP/baldes.txt" \
    BACKUP_AGORA=20261005T031007Z \
    BACKUP_DUMP_CMD="printf 'PGDMP-de-mentira'" \
    BACKUP_SQL_CMD="printf 'users|3\ncompanies|2\n'" \
    "$@" bash "$RAIZ/ops/backup-externo.sh"
}

cenario() {
  local dir="$TMP/$1"
  mkdir -p "$dir/fake/origem/plugga-um" "$dir/fake/origem/waze-dois" "$dir/fake/destino"
  : >"$dir/log"
  : >"$dir/pings"
  printf 'conteudo sintetico 1' >"$dir/fake/origem/plugga-um/a.txt"
  printf 'conteudo sintetico 22' >"$dir/fake/origem/waze-dois/b.txt"
  echo "$dir"
}

# 1. caso feliz -----------------------------------------------------------
D=$(cenario feliz)
SAIDA=$(executa "$D" 2>&1) || { echo "$SAIDA" >&2; falha "o caso feliz deveria passar"; }
ARQ=$(ls "$D"/fake/destino/backups-externos/diario/2026/10/*.tar.age)
MAN=$(ls "$D"/fake/destino/backups-externos/diario/2026/10/*.manifesto.json)
[ -f "$ARQ" ] && [ -f "$MAN" ] || falha "faltou o arquivo ou o manifesto no destino"
SHA=$(sha256sum "$ARQ" | awk '{print $1}')
grep -q "\"sha256\": \"$SHA\"" "$MAN" || falha "o SHA-256 do manifesto não é o do arquivo"
grep -q "\"bytes\": $(wc -c <"$ARQ" | tr -d ' ')," "$MAN" || falha "os bytes do manifesto não são os do arquivo"
grep -q '"tabelas": 2' "$MAN" && grep -q '"users": 3' "$MAN" || falha "contagens do banco ausentes no manifesto"
grep -q '"plugga-um": { "objetos": 1, "bytes": 20 }' "$MAN" || falha "contagem do balde plugga-um errada no manifesto"
if grep -q 'a\.txt\|b\.txt' "$MAN"; then falha "o manifesto tem nome de objeto (deveria só ter contagens)"; fi
for chave in dono teste; do
  mkdir -p "$D/dec-$chave"
  age -d -i "$TMP/$chave.key" "$ARQ" | tar -C "$D/dec-$chave" -xf - || falha "a chave $chave não decifrou"
  [ -f "$D/dec-$chave/banco/plugga_os.dump" ] || falha "sem dump ao decifrar com $chave"
  [ -f "$D/dec-$chave/arquivos/plugga-um/a.txt" ] || falha "sem arquivos ao decifrar com $chave"
  [ -f "$D/dec-$chave/LEIAME.txt" ] || falha "sem LEIAME ao decifrar com $chave"
done
[ ! -d "$D/fake/destino/backups-externos/mensal" ] || falha "não era dia 1: não deveria haver cópia mensal"
grep -q 'SEGREDO_PING_ZZ' "$D/pings" || falha "o heartbeat de sucesso não foi enviado"
if grep -q '/fail' "$D/pings"; then falha "o caso feliz mandou ping de falha"; fi
ok "caso feliz: cifrado para dono e teste, manifesto coerente, heartbeat de sucesso"

# 2. nenhuma chave em argv --------------------------------------------------
if grep -q 'SEGREDO' "$D/log"; then falha "uma chave apareceu em argv (aws ou curl)"; fi
if grep -nE 'docker run[^\n]* -e [A-Z_]+=' "$RAIZ/ops/backup-externo.sh" | grep -v 'printf' | grep -q .; then
  falha "o script passa chave por -e/linha de comando"
fi
grep -q -- '--env-file' "$RAIZ/ops/backup-externo.sh" || falha "o script deveria usar --env-file"
ok "nenhuma chave em argv; o docker recebe o ambiente por --env-file"

# 3. dia 1 gera cópia mensal ----------------------------------------------
D=$(cenario mensal)
executa "$D" BACKUP_AGORA=20261101T031007Z >/dev/null 2>&1 || falha "o ciclo do dia 1 deveria passar"
ls "$D"/fake/destino/backups-externos/mensal/2026/*.tar.age >/dev/null 2>&1 || falha "dia 1 sem cópia mensal"
ok "dia 1: cópia mensal gravada"

# 4. falhas ----------------------------------------------------------------
espera_falha() {
  local nome=$1 motivo=$2 dir
  shift 2
  dir=$(cenario "$nome")
  if SAIDA=$(executa "$dir" "$@" 2>&1); then falha "$nome: deveria falhar"; fi
  printf '%s' "$SAIDA" | grep -q "$motivo" || { echo "$SAIDA" >&2; falha "$nome: a mensagem não cita '$motivo'"; }
  grep -q '/fail' "$dir/pings" || falha "$nome: faltou o ping de falha"
  ok "$nome: falha com a mensagem certa e ping de falha"
}

# origem vazia: baldes sem objeto (cenário próprio, sem arquivos)
dir="$TMP/origem-vazia"
mkdir -p "$dir/fake/origem/plugga-um" "$dir/fake/origem/waze-dois" "$dir/fake/destino"
: >"$dir/log"
: >"$dir/pings"
if SAIDA=$(executa "$dir" 2>&1); then falha "origem-vazia: deveria falhar"; fi
printf '%s' "$SAIDA" | grep -q "baldes de origem estão vazios" || falha "origem-vazia: mensagem errada: $SAIDA"
grep -q '/fail' "$dir/pings" || falha "origem-vazia: faltou o ping de falha"
[ ! -d "$dir/fake/destino/backups-externos" ] || falha "origem-vazia: algo chegou ao destino"
ok "baldes de origem vazios: falha e nada é enviado"

espera_falha banco-vazio "banco de origem está vazio" BACKUP_SQL_CMD="printf 'users|0\n'"
espera_falha dump-vazio "dump do banco veio vazio" BACKUP_DUMP_CMD="true"
espera_falha balde-ilegivel "não consegui ler o balde" BACKUP_BALDES="$TMP/baldes-ruim.txt"
espera_falha tamanho-divergente "tamanho no destino" FAKE_APENDA=1
espera_falha sha-divergente "SHA-256 no destino diferente" FAKE_TROCA=1
espera_falha um-destinatario "ao menos 2 destinatários" BACKUP_RECEPTORES="$TMP/um-so.txt"
