#!/usr/bin/env bash
#
# Ensaio de ponta a ponta da primeira publicação com os três logins do banco, num
# Postgres DESCARTÁVEL: o da infra de teste local (55433), num banco próprio. Nunca
# a VPS. Repete o que o deploy.sh faz com o banco, na ordem:
#
#   1. o schema da origin/main (a produção de hoje) e um login legado com grants
#      diretos, como o plugga_app de antes do RLS;
#   2. o preflight reprovando: sem AUTH/JOBS no .env; logins inexistentes; o login
#      legado como runtime;
#   3. os três logins novos: o preflight aprova;
#   4. as migrations da develop: a reversão fica bloqueada (o RLS entrou agora);
#   5. o configurar-papeis duas vezes (idempotente);
#   6. o validador da API nos três pools aprova, e reprova o login legado.
#
# No fim apaga o banco e os logins de ensaio (os logins são do cluster inteiro).
#
# Uso, da raiz, com a infra de teste de pé e o dist da API compilado:
#   bash ops/deploy-papeis.ensaio.sh
#
# SC2034: ISOLAMENTO_ANTES e MIGRACAO_DO_ISOLAMENTO são lidas pela lib-papeis.sh.
# shellcheck disable=SC2034
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
CONTEINER=${ENSAIO_CONTEINER:-plugga-os-local-test-postgres-test-1}
SUPER=plugga_os_test
SENHA_SUPER=local_test_only_change_me
PORTA=55433
BANCO=plugga_deploy_ensaio_test
P=plugga_ensaio
LEGADO=${P}_app
RT=${P}_rt
AUTH=${P}_auth
JOBS=${P}_jobs
MIGRACAO_DO_ISOLAMENTO=20261106010000_isolamento_rls

TMP=$(mktemp -d)
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

# Só no contêiner da infra de teste local, num banco *_test.
case "$CONTEINER" in plugga-os-local-test-*) ;; *) falha "ensaio só roda na infra de teste local" ;; esac
case "$BANCO" in *_test) ;; *) falha "ensaio só roda num banco *_test" ;; esac
docker exec "$CONTEINER" pg_isready -U "$SUPER" >/dev/null || falha "infra de teste fora do ar (node scripts/local-test.mjs up)"

psql_super() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTEINER" psql -U "$SUPER" -d "${1:-postgres}" -X -A -t -q -v ON_ERROR_STOP=1 "${@:2}"; }
# As duas funções que o deploy.sh define, apontadas para o banco do ensaio.
psql_como_dono() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTEINER" psql -U "$SUPER" -d "$BANCO" -X -A -t -q -v ON_ERROR_STOP=1 "$@"; }
conecta_como() {
  MSYS_NO_PATHCONV=1 docker exec -i "$CONTEINER" sh -c \
    'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -h "$(hostname -i | cut -d" " -f1)" -U "$1" -d "$2" -X -A -t -q -c "SELECT 1"' _ "$1" "$BANCO"
}

limpa() {
  psql_super postgres -c "DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)" >/dev/null 2>&1 || true
  for papel in "$LEGADO" "$RT" "$AUTH" "$JOBS"; do
    psql_super postgres -c "DROP ROLE IF EXISTS ${papel}" >/dev/null 2>&1 || true
  done
  rm -rf "$TMP"
}
trap limpa EXIT
limpa; TMP=$(mktemp -d)

# shellcheck disable=SC1091
. "$RAIZ/ops/lib-papeis.sh"

URL_DONO="postgresql://${SUPER}:${SENHA_SUPER}@127.0.0.1:${PORTA}/${BANCO}?schema=public"
SENHA=$(openssl rand -hex 16)
url() { printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' "$1" "$SENHA" "$PORTA" "$BANCO"; }

# ------------------------------------------------ 1. a produção de hoje
psql_super postgres -c "CREATE DATABASE ${BANCO} OWNER ${SUPER}" >/dev/null
psql_super postgres -c "ALTER DATABASE ${BANCO} SET plugga.ambiente = 'local'" >/dev/null
mkdir -p "$TMP/main"
git -C "$RAIZ" archive origin/main apps/api/prisma | tar -x -C "$TMP/main"
# Da pasta extraída: dentro de apps/api, o prisma.config.ts da develop apontaria as
# migrations da develop e ignoraria o --schema.
(cd "$TMP/main/apps/api/prisma" && DATABASE_URL="$URL_DONO" "$RAIZ/apps/api/node_modules/.bin/prisma" migrate deploy --schema schema.prisma >"$TMP/migra-main.log" 2>&1) || { cat "$TMP/migra-main.log"; falha "schema da origin/main"; }
[ "$(psql_como_dono -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '${MIGRACAO_DO_ISOLAMENTO}'")" = "0" ] || falha "a origin/main já teria o RLS?"
[ "$(psql_como_dono -c "SELECT count(*) > 0 FROM _prisma_migrations")" = "t" ] || falha "nenhuma migration da origin/main aplicada"
# O login legado: DML direto em tudo e permissões padrão, como um papel de aplicação de antes do RLS.
psql_como_dono >/dev/null <<SQL
CREATE ROLE ${LEGADO} LOGIN INHERIT PASSWORD '${SENHA}';
GRANT USAGE ON SCHEMA public TO ${LEGADO};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${LEGADO};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${LEGADO};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${LEGADO};
SQL
ok "1. banco com o schema da origin/main e um login legado com grants diretos"

# ------------------------------------------------ 2. o preflight reprovando
printf 'APP_DB_USER=%s\nAPP_DB_PASSWORD=%s\n' "$LEGADO" "$SENHA" >"$TMP/env-so-legado"
if confere_logins_do_banco "$TMP/env-so-legado" "$SUPER" >/dev/null 2>"$TMP/saida"; then falha "sem AUTH/JOBS deveria reprovar"; fi
grep -q "AUTH_DATABASE_URL ausente" "$TMP/saida" && grep -q "JOBS_DATABASE_URL ausente" "$TMP/saida" || falha "mensagem de AUTH/JOBS ausentes"
ok "2a. preflight reprova sem AUTH_DATABASE_URL e JOBS_DATABASE_URL"

{ printf 'APP_DB_USER=%s\nAPP_DB_PASSWORD=%s\n' "$RT" "$SENHA"; printf 'AUTH_DATABASE_URL=%s\nJOBS_DATABASE_URL=%s\n' "$(url "$AUTH")" "$(url "$JOBS")"; } >"$TMP/env-novos"
if confere_logins_do_banco "$TMP/env-novos" "$SUPER" >/dev/null 2>"$TMP/saida"; then falha "logins inexistentes deveriam reprovar"; fi
grep -q "pool runtime: o login ${RT} não existe" "$TMP/saida" && grep -q "pool jobs: o login ${JOBS} não existe" "$TMP/saida" || { cat "$TMP/saida"; falha "mensagem de login inexistente"; }
ok "2b. preflight reprova logins que ainda não existem, apontando cada pool"

# Os três logins novos, como o André os cria (ops/GUIA.md): LOGIN, INHERIT, nada mais.
for papel in "$RT" "$AUTH" "$JOBS"; do
  psql_super postgres -c "CREATE ROLE ${papel} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${SENHA}'" >/dev/null
done
{ printf 'APP_DB_USER=%s\nAPP_DB_PASSWORD=%s\n' "$LEGADO" "$SENHA"; printf 'AUTH_DATABASE_URL=%s\nJOBS_DATABASE_URL=%s\n' "$(url "$AUTH")" "$(url "$JOBS")"; } >"$TMP/env-legado"
if confere_logins_do_banco "$TMP/env-legado" "$SUPER" >/dev/null 2>"$TMP/saida"; then falha "o login legado como runtime deveria reprovar"; fi
grep -q "pool runtime: o login ${LEGADO} tem permissão direta antiga" "$TMP/saida" && grep -q "permissões padrão" "$TMP/saida" || { cat "$TMP/saida"; falha "mensagem do login legado"; }
ok "2c. preflight reprova reaproveitar o login legado (grants diretos e permissões padrão)"

printf 'APP_DB_USER=%s\nAPP_DB_PASSWORD=errada\nAUTH_DATABASE_URL=%s\nJOBS_DATABASE_URL=%s\n' "$RT" "$(url "$AUTH")" "$(url "$JOBS")" >"$TMP/env-senha-errada"
if confere_logins_do_banco "$TMP/env-senha-errada" "$SUPER" >/dev/null 2>"$TMP/saida"; then falha "senha errada deveria reprovar"; fi
grep -q "pool runtime: o login ${RT} não conectou" "$TMP/saida" || { cat "$TMP/saida"; falha "mensagem da senha errada"; }
ok "2d. preflight reprova senha errada, conectando de verdade"

# ------------------------------------------------ 3. os logins novos aprovam
confere_logins_do_banco "$TMP/env-novos" "$SUPER" >"$TMP/saida" 2>&1 || { cat "$TMP/saida"; falha "os três logins novos deveriam aprovar"; }
grep -qF "$SENHA" "$TMP/saida" && falha "o preflight imprimiu a senha"
ok "3. preflight aprova os três logins novos, sem imprimir senha"

# ------------------------------------------------ 4. migrations da develop
ISOLAMENTO_ANTES=$(psql_como_dono -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '${MIGRACAO_DO_ISOLAMENTO}' AND finished_at IS NOT NULL")
(cd "$RAIZ/apps/api" && DATABASE_URL="$URL_DONO" npx prisma migrate deploy >"$TMP/migra-develop.log" 2>&1) || { tail -20 "$TMP/migra-develop.log"; falha "migrations da develop"; }
reversao_bloqueada || falha "o RLS entrou nesta publicação: a reversão deveria ficar bloqueada"
ok "4. migrations da develop aplicadas; a reversão da imagem fica bloqueada"

# ------------------------------------------------ 5. configurar os papéis, duas vezes
le_logins_do_env "$TMP/env-novos"
configura_papeis_da_aplicacao "$RAIZ/ops/configurar-papeis-aplicacao.sql" >/dev/null || falha "configurar-papeis (1ª vez)"
configura_papeis_da_aplicacao "$RAIZ/ops/configurar-papeis-aplicacao.sql" >/dev/null 2>&1 || falha "configurar-papeis (2ª vez) deveria ser idempotente"
MEMBROS=$(psql_como_dono -c "SELECT string_agg(pg_get_userbyid(m.member) || '>' || pg_get_userbyid(m.roleid), ',' ORDER BY pg_get_userbyid(m.member)) FROM pg_auth_members m WHERE pg_get_userbyid(m.member) IN ('${RT}', '${AUTH}', '${JOBS}')")
[ "$MEMBROS" = "${AUTH}>plugga_auth_runtime,${JOBS}>plugga_jobs_runtime,${RT}>plugga_runtime" ] || falha "cada login com o grupo do seu pool, e só ele (veio: ${MEMBROS})"
ok "5. configurar-papeis concede um grupo por login e pode rodar de novo"

# Depois da 1ª publicação, o preflight segue aprovando (cada login já é membro do seu grupo).
confere_logins_do_banco "$TMP/env-novos" "$SUPER" >/dev/null 2>"$TMP/saida" || { cat "$TMP/saida"; falha "o preflight da publicação seguinte deveria aprovar"; }
ok "5b. na publicação seguinte o preflight continua aprovando"

# ------------------------------------------------ 6. o validador da API nos três pools
[ -f "$RAIZ/apps/api/dist/prisma/validar-papel-banco.js" ] || falha "compile a API (dist) antes do ensaio"
valida() {
  (cd "$RAIZ/apps/api" && NODE_ENV=production DATABASE_URL="$1" AUTH_DATABASE_URL="$2" JOBS_DATABASE_URL="$3" \
    node --input-type=module - <"$RAIZ/ops/verificar-pools-do-banco.mjs")
}
valida "$(url "$RT")" "$(url "$AUTH")" "$(url "$JOBS")" >"$TMP/pools" 2>&1 || { cat "$TMP/pools"; falha "o validador deveria aprovar os três pools"; }
[ "$(grep -c '^✓ pool' "$TMP/pools")" = "3" ] || { cat "$TMP/pools"; falha "três pools aprovados"; }
grep -qF "$SENHA" "$TMP/pools" && falha "o validador imprimiu a senha"
ok "6. o validador da API aprova os três pools"

if valida "$(url "$LEGADO")" "$(url "$AUTH")" "$(url "$JOBS")" >"$TMP/pools" 2>&1; then falha "o login legado como runtime deveria reprovar no validador"; fi
grep -q "✗ pool runtime" "$TMP/pools" || { cat "$TMP/pools"; falha "o validador aponta o pool runtime"; }
ok "6b. o validador reprova o login legado como runtime (o achado do preflight)"

echo "ensaio completo; banco e logins de ensaio apagados ao sair"
