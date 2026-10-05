#!/usr/bin/env bash
#
# Ensaio de ops/restaurar-teste.sh: caso feliz, origem vazia e dump adulterado.
# Precisa de um Postgres no ar (RESTAURA_PGHOST/PORT/USER, modo servidor) e das
# ferramentas pg_dump/pg_restore. Não precisa de Docker nem da VPS.
#
# Uso:
#   RESTAURA_PGHOST=localhost RESTAURA_PGPORT=55432 RESTAURA_PGUSER=plugga_os_test \
#     PGPASSWORD=... bash ops/restaurar-teste.test.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
export RESTAURA_MODO=servidor
: "${RESTAURA_PGHOST:?defina RESTAURA_PGHOST}"
PGPORTA=${RESTAURA_PGPORT:-5432}
PGUSUARIO=${RESTAURA_PGUSER:-postgres}
TMP=$(mktemp -d)
ORIGEM_DB="origem_$$"
trap 'psql -h "$RESTAURA_PGHOST" -p "$PGPORTA" -U "$PGUSUARIO" -d postgres -X -q -c "DROP DATABASE IF EXISTS \"$ORIGEM_DB\"" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }
psqlx() { psql -h "$RESTAURA_PGHOST" -p "$PGPORTA" -U "$PGUSUARIO" -X -q "$@"; }

# Banco de origem com duas tabelas e uma linha de dado sintético.
psqlx -d postgres -c "CREATE DATABASE \"$ORIGEM_DB\"" >/dev/null
psqlx -d "$ORIGEM_DB" -c "CREATE TABLE a (id int primary key, nome text); CREATE TABLE b (id int primary key); INSERT INTO a VALUES (1, 'sintetico');" >/dev/null
pg_dump -h "$RESTAURA_PGHOST" -p "$PGPORTA" -U "$PGUSUARIO" -Fc "$ORIGEM_DB" >"$TMP/bom.dump"

# 1. caso feliz
SAIDA=$(RESTAURA_TABELAS_MINIMO=2 bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/bom.dump" 2>&1) || { echo "$SAIDA" >&2; falha "o dump bom deveria restaurar"; }
printf '%s' "$SAIDA" | grep -q "restauração ok: 2 tabelas" || falha "não confirmou as 2 tabelas: $SAIDA"
ok "caso feliz: o dump restaura e a contagem de tabelas confere"

# 2. origem vazia (arquivo vazio, pasta sem dump, arquivo inexistente)
: >"$TMP/vazio.dump"
if bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/vazio.dump" >/dev/null 2>"$TMP/e1"; then falha "dump vazio deveria falhar"; fi
grep -q "vazio" "$TMP/e1" || falha "a recusa do dump vazio não explicou o motivo"
mkdir "$TMP/pasta-vazia"
if bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/pasta-vazia" >/dev/null 2>"$TMP/e2"; then falha "pasta sem dump deveria falhar"; fi
grep -q "nenhum .dump" "$TMP/e2" || falha "a recusa da pasta vazia não explicou o motivo"
if bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/nao-existe.dump" >/dev/null 2>&1; then falha "arquivo inexistente deveria falhar"; fi
ok "origem vazia ou ausente falha, com mensagem"

# 3. dump adulterado (bytes do meio trocados) e truncado
cp "$TMP/bom.dump" "$TMP/adulterado.dump"
TAM=$(wc -c <"$TMP/adulterado.dump")
printf 'LIXO-LIXO-LIXO-LIXO' | dd of="$TMP/adulterado.dump" bs=1 seek=$((TAM / 2)) conv=notrunc 2>/dev/null
if bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/adulterado.dump" >/dev/null 2>&1; then falha "dump adulterado deveria falhar"; fi
head -c $((TAM / 3)) "$TMP/bom.dump" >"$TMP/truncado.dump"
if bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/truncado.dump" >/dev/null 2>&1; then falha "dump truncado deveria falhar"; fi
ok "dump adulterado ou truncado falha"

# 4. tabelas de menos do que o mínimo
if RESTAURA_TABELAS_MINIMO=3 bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/bom.dump" >/dev/null 2>&1; then falha "com mínimo 3 e 2 tabelas deveria falhar"; fi
ok "banco com tabelas de menos que o mínimo falha"

# 5. pacote do backup externo (T053): .tar.age + manifesto, com chave de teste
command -v age >/dev/null && command -v age-keygen >/dev/null || falha "precisa de age e age-keygen"
age-keygen -o "$TMP/dono.key" 2>/dev/null
age-keygen -o "$TMP/teste.key" 2>/dev/null
age-keygen -o "$TMP/outra.key" 2>/dev/null
RECEPTORES=(-r "$(age-keygen -y "$TMP/dono.key")" -r "$(age-keygen -y "$TMP/teste.key")")

# Contagens reais da origem (a tabela a tem 1 linha, a b nenhuma).
monta_pacote() { # $1 = nome, $2 = JSON de linhasPorTabela, $3 = JSON de baldes
  local nome=$1 pasta="$TMP/pacote-$1"
  mkdir -p "$pasta/conteudo/banco" "$pasta/conteudo/arquivos/plugga-um" "$pasta/conteudo/arquivos/waze-dois"
  cp "$TMP/bom.dump" "$pasta/conteudo/banco/plugga_os.dump"
  printf 'um' >"$pasta/conteudo/arquivos/plugga-um/a.txt"
  printf 'dois' >"$pasta/conteudo/arquivos/plugga-um/b.txt"
  printf 'tres' >"$pasta/conteudo/arquivos/waze-dois/c.txt"
  tar -C "$pasta/conteudo" -cf "$pasta/$nome.tar" .
  age "${RECEPTORES[@]}" -o "$pasta/$nome.tar.age" "$pasta/$nome.tar"
  local sha bytes
  sha=$(sha256sum "$pasta/$nome.tar.age" | awk '{print $1}')
  bytes=$(wc -c <"$pasta/$nome.tar.age" | tr -d ' ')
  cat >"$pasta/$nome.manifesto.json" <<JSON
{
  "formato": 1,
  "criadoEm": "2026-10-05T03:10:07Z",
  "arquivo": { "nome": "$nome.tar.age", "bytes": $bytes, "sha256": "$sha" },
  "banco": { "tabelas": 2, "linhasPorTabela": { $2 } },
  "arquivos": { "baldes": { $3 } },
  "destinatarios": [ "age1x", "age1y" ]
}
JSON
}
LINHAS_OK='"a": 1, "b": 0'
BALDES_OK='"plugga-um": { "objetos": 2, "bytes": 6 }, "waze-dois": { "objetos": 1, "bytes": 4 }'
restaura_pacote() { # $1 = nome do pacote ; resto = variáveis extras
  local nome=$1
  shift
  env RESTAURA_CHAVE_AGE="$TMP/teste.key" RESTAURA_REGISTRO="$TMP/registro.log" BACKUP_EXTERNO_ENV="$TMP/nao-existe.env" \
    "$@" bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/pacote-$nome/$nome.tar.age"
}

monta_pacote ok "$LINHAS_OK" "$BALDES_OK"
SAIDA=$(restaura_pacote ok 2>&1) || { echo "$SAIDA" >&2; falha "o pacote bom deveria restaurar"; }
printf '%s' "$SAIDA" | grep -q "1 linhas conferidas com o manifesto, 3 objetos em 2 baldes" || falha "não confirmou linhas e objetos: $SAIDA"
grep -q " OK ok.tar.age: 2 tabelas" "$TMP/registro.log" || falha "o resultado não foi registrado"
ok "pacote externo: SHA-256, decifragem, linhas e objetos conferem e o resultado é registrado"

# a chave do dono também decifra (os dois destinatários)
env RESTAURA_CHAVE_AGE="$TMP/dono.key" RESTAURA_REGISTRO="$TMP/registro.log" BACKUP_EXTERNO_ENV="$TMP/x.env" \
  bash "$RAIZ/ops/restaurar-teste.sh" "$TMP/pacote-ok/ok.tar.age" >/dev/null 2>&1 || falha "a chave do dono deveria decifrar"

# chave sem acesso, ausente
if restaura_pacote ok RESTAURA_CHAVE_AGE="$TMP/outra.key" >/dev/null 2>"$TMP/e3"; then falha "chave de fora deveria falhar"; fi
grep -q "decifrar" "$TMP/e3" || falha "a recusa da chave errada não explicou o motivo"
if restaura_pacote ok RESTAURA_CHAVE_AGE="" >/dev/null 2>&1; then falha "sem chave deveria falhar"; fi
ok "chave de fora ou ausente falha"

# SHA-256 / tamanho adulterado: byte trocado no pacote depois do manifesto
mkdir -p "$TMP/pacote-troca" && cp "$TMP/pacote-ok/ok.tar.age" "$TMP/pacote-ok/ok.manifesto.json" "$TMP/pacote-troca/"
for f in "$TMP"/pacote-troca/ok.*; do mv "$f" "${f/ok./troca.}"; done
printf 'Z' | dd of="$TMP/pacote-troca/troca.tar.age" bs=1 seek=40 conv=notrunc 2>/dev/null
if restaura_pacote troca >/dev/null 2>"$TMP/e4"; then falha "pacote com byte trocado deveria falhar"; fi
grep -q "SHA-256" "$TMP/e4" || falha "a recusa não citou o SHA-256"
printf 'x' >>"$TMP/pacote-troca/troca.tar.age"
if restaura_pacote troca >/dev/null 2>"$TMP/e5"; then falha "pacote com tamanho diferente deveria falhar"; fi
grep -q "tamanho" "$TMP/e5" || falha "a recusa não citou o tamanho"
rm "$TMP/pacote-troca/troca.manifesto.json"
if restaura_pacote troca >/dev/null 2>"$TMP/e6"; then falha "pacote sem manifesto deveria falhar"; fi
grep -q "manifesto" "$TMP/e6" || falha "a recusa não citou o manifesto"
ok "pacote adulterado, com tamanho diferente ou sem manifesto falha"

# divergência de contagem: tabela, balde
monta_pacote linhas '"a": 5, "b": 0' "$BALDES_OK"
if restaura_pacote linhas >/dev/null 2>"$TMP/e7"; then falha "contagem de linhas divergente deveria falhar"; fi
grep -q "contagem de linhas" "$TMP/e7" || falha "a recusa não citou a contagem"
monta_pacote balde "$LINHAS_OK" '"plugga-um": { "objetos": 3, "bytes": 6 }, "waze-dois": { "objetos": 1, "bytes": 4 }'
if restaura_pacote balde >/dev/null 2>"$TMP/e8"; then falha "balde divergente deveria falhar"; fi
grep -q "plugga-um" "$TMP/e8" || falha "a recusa não citou o balde"
grep -q "FALHA" "$TMP/registro.log" || falha "a falha não foi registrada"
ok "divergência de linhas ou de objetos em relação ao manifesto falha"

# heartbeat: ping de sucesso e /fail em erro (curl de mentira só registra a URL)
mkdir -p "$TMP/bin"
cat >"$TMP/bin/curl" <<'CURL'
#!/usr/bin/env bash
cat >>"$FAKE_PINGS"
CURL
chmod +x "$TMP/bin/curl"
printf 'HEARTBEAT_RESTAURA_URL=https://hc.exemplo.test/ping/SEGREDO_RESTAURA_ZZ\n' >"$TMP/hb.env"
: >"$TMP/pings"
restaura_pacote ok BACKUP_EXTERNO_ENV="$TMP/hb.env" BACKUP_CURL="$TMP/bin/curl" FAKE_PINGS="$TMP/pings" >/dev/null 2>&1 || falha "pacote bom com heartbeat deveria restaurar"
grep -q 'ping/SEGREDO_RESTAURA_ZZ"' "$TMP/pings" || falha "faltou o ping de sucesso"
: >"$TMP/pings"
restaura_pacote linhas BACKUP_EXTERNO_ENV="$TMP/hb.env" BACKUP_CURL="$TMP/bin/curl" FAKE_PINGS="$TMP/pings" >/dev/null 2>&1 && falha "pacote ruim deveria falhar"
grep -q 'ping/SEGREDO_RESTAURA_ZZ/fail"' "$TMP/pings" || falha "faltou o ping de falha"
ok "heartbeat: ping no sucesso e /fail na falha"

# --externo: baixa o mais recente do destino (mc de mentira lendo de uma pasta)
mkdir -p "$TMP/fake/destino-b2/diario/2026/09" "$TMP/fake/destino-b2/diario/2026/10"
cp "$TMP/pacote-balde/balde.tar.age" "$TMP/fake/destino-b2/diario/2026/09/plugga-os-20260930T031007Z.tar.age"
cp "$TMP/pacote-balde/balde.manifesto.json" "$TMP/fake/destino-b2/diario/2026/09/plugga-os-20260930T031007Z.manifesto.json"
cp "$TMP/pacote-ok/ok.tar.age" "$TMP/fake/destino-b2/diario/2026/10/plugga-os-20261005T031007Z.tar.age"
cp "$TMP/pacote-ok/ok.manifesto.json" "$TMP/fake/destino-b2/diario/2026/10/plugga-os-20261005T031007Z.manifesto.json"
cat >"$TMP/bin/mc" <<'MC'
#!/usr/bin/env bash
set -euo pipefail
sub=$1; shift
args=()
for a in "$@"; do case "$a" in --quiet | --recursive | --json) ;; *) args+=("$a") ;; esac; done
mapeia() {
  case "$1" in
    /trabalho/*) echo "$RESTAURA_TRABALHO/${1#/trabalho/}" ;;
    leitura/backups-externos/*) echo "$FAKE_B2/${1#leitura/backups-externos/}" ;;
  esac
}
case "$sub" in
  ls) (cd "$(mapeia "${args[0]}")" && find . -type f -name '*.age' | sed 's|^\./||' | while read -r f; do
        printf '{"status":"success","type":"file","size":1,"key":"%s"}\n' "$f"; done) ;;
  cp) mkdir -p "$(dirname "$(mapeia "${args[1]}")")"; cp "$(mapeia "${args[0]}")" "$(mapeia "${args[1]}")" ;;
esac
MC
chmod +x "$TMP/bin/mc"
printf 'DESTINO_LEITURA_URL=https://l:SEGREDO@s3.exemplo.test\nDESTINO_BALDE=backups-externos\n' >"$TMP/externo.env"
SAIDA=$(env RESTAURA_CHAVE_AGE="$TMP/teste.key" RESTAURA_REGISTRO="$TMP/registro.log" BACKUP_EXTERNO_ENV="$TMP/externo.env" \
  BACKUP_MC="$TMP/bin/mc" FAKE_B2="$TMP/fake/destino-b2" BACKUP_DIR_TRABALHO="$TMP/trab-externo" RESTAURA_TRABALHO="$TMP/trab-externo" \
  bash "$RAIZ/ops/restaurar-teste.sh" --externo 2>&1) \
  || { echo "$SAIDA" >&2; falha "--externo deveria restaurar o mais recente"; }
printf '%s' "$SAIDA" | grep -q "20261005T031007Z" || falha "não pegou o backup mais recente: $SAIDA"
ok "--externo baixa o mais recente e restaura"

# 5. nenhum banco descartável fica para trás
SOBRAS=$(psqlx -d postgres -A -t -c "SELECT count(*) FROM pg_database WHERE datname LIKE 'restauracao_%'")
[ "$(printf '%s' "$SOBRAS" | tr -d '[:space:]')" = "0" ] || falha "ficaram bancos restauracao_* para trás"
ok "nenhum banco descartável fica para trás"
