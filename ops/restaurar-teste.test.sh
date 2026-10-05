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

# 5. nenhum banco descartável fica para trás
SOBRAS=$(psqlx -d postgres -A -t -c "SELECT count(*) FROM pg_database WHERE datname LIKE 'restauracao_%'")
[ "$(printf '%s' "$SOBRAS" | tr -d '[:space:]')" = "0" ] || falha "ficaram bancos restauracao_* para trás"
ok "nenhum banco descartável fica para trás"
