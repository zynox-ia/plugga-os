#!/usr/bin/env bash
#
# Prova o preflight dos três logins do banco (ops/lib-papeis.sh) e a ordem dos
# passos no deploy.sh, sem Docker nem VPS: o psql é substituído por funções que
# devolvem o que o banco devolveria. O ensaio contra um Postgres de verdade fica
# no ops/deploy-papeis.ensaio.sh.
#
# Uso: bash ops/deploy-papeis.test.sh
#
# SC2015: `cond && cond || falha` é a asserção daqui (falha sempre encerra).
# SC2016: os grep procuram texto literal do deploy.sh, com `$`.
# SC2034/SC2317: variáveis e dublês usados pela biblioteca, não por este arquivo.
# shellcheck disable=SC2015,SC2016,SC2034,SC2317
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

# shellcheck disable=SC1091
. "$RAIZ/ops/lib-papeis.sh"

# ------------------------------------------------------------ .env e URLs
cat >"$TMP/env" <<'ENV'
APP_DB_USER=velho_que_nao_vale
COMENTARIO=um valor com espaço e $DOLAR
APP_DB_USER=plugga_rt_app
APP_DB_PASSWORD='teste=teste=teste'
AUTH_DATABASE_URL="postgresql://plugga_auth_app:teste%40teste%3Ateste%2Fteste%25teste%3D@postgres:5432/plugga_os?schema=public"
JOBS_DATABASE_URL=postgresql://plugga_jobs_app:abc123@postgres:5432/plugga_os
ENV
le_logins_do_env "$TMP/env"
[ "$LOGIN_RUNTIME" = "plugga_rt_app" ] || falha "a última atribuição do .env deveria valer (veio '$LOGIN_RUNTIME')"
[ "$SENHA_RUNTIME" = "teste=teste=teste" ] || falha "aspas e '=' na senha do .env"
[ "$LOGIN_AUTH" = "plugga_auth_app" ] || falha "usuário da AUTH_DATABASE_URL"
[ "$SENHA_AUTH" = "teste@teste:teste/teste%teste=" ] || falha "senha percent-codificada na URL (veio '$SENHA_AUTH')"
[ "$(decodifica_url 'a\nb%20c')" = 'a\nb c' ] || falha "barra invertida crua da senha segue literal"
[ "$LOGIN_JOBS" = "plugga_jobs_app" ] && [ "$SENHA_JOBS" = "abc123" ] || falha "URL de jobs sem aspas"
ok "lê o .env sem executá-lo e decodifica usuário e senha das URLs (com @, :, /, % e =)"

[ -z "$(usuario_da_url "postgresql://postgres:5432/plugga_os")" ] || falha "URL sem credencial não tem usuário"
[ "$(valor_do_env "$TMP/nao-existe" X)" = "" ] || falha ".env ausente devolve vazio"
ok "URL sem credencial e .env ausente não quebram"

# ------------------------------------------------------ o que falta no .env
cat >"$TMP/env-incompleto" <<'ENV'
APP_DB_PASSWORD=x
AUTH_DATABASE_URL=postgresql://plugga_os:x@postgres:5432/plugga_os
ENV
le_logins_do_env "$TMP/env-incompleto"
SAIDA=$(problemas_do_env plugga_os)
grep -q "JOBS_DATABASE_URL ausente" <<<"$SAIDA" || falha "deveria apontar a JOBS_DATABASE_URL ausente"
grep -q "plugga_os' é o dono do banco" <<<"$SAIDA" || falha "deveria recusar o dono como login da aplicação"
[ "$LOGIN_RUNTIME" = "plugga_app" ] || falha "sem APP_DB_USER, o runtime é o padrão do compose (plugga_app)"
ok "aponta a URL ausente e recusa o dono do banco como login"

cat >"$TMP/env-repetido" <<'ENV'
APP_DB_USER=plugga_rt_app
APP_DB_PASSWORD=x
AUTH_DATABASE_URL=postgresql://plugga_rt_app:x@postgres:5432/plugga_os
JOBS_DATABASE_URL=postgresql://Maiusculo:x@postgres:5432/plugga_os
ENV
le_logins_do_env "$TMP/env-repetido"
SAIDA=$(problemas_do_env plugga_os)
grep -q "precisam ser distintos" <<<"$SAIDA" || falha "deveria exigir três logins distintos"
grep -q "fora do formato" <<<"$SAIDA" || falha "deveria recusar login fora do formato"
ok "exige três logins distintos e no formato"

# ------------------------------------------------- o preflight inteiro (com dublês)
BANCO_RESPONDE="" # o que o "banco" devolve para a consulta dos problemas
CONECTA_FALHA=""  # login que "não conecta"
psql_como_dono() {
  cat >"$TMP/sql-recebido"
  printf '%s\n' "$*" >"$TMP/args-recebidos"
  printf '%s' "$BANCO_RESPONDE"
}
conecta_como() {
  local senha
  IFS= read -r senha
  printf '%s %s\n' "$1" "$senha" >>"$TMP/conexoes"
  [ "$1" != "$CONECTA_FALHA" ]
}

: >"$TMP/conexoes"
confere_logins_do_banco "$TMP/env" plugga_os >"$TMP/saida" 2>&1 || falha "preflight com tudo certo deveria passar: $(cat "$TMP/saida")"
grep -q "runtime=plugga_rt_app, auth=plugga_auth_app, jobs=plugga_jobs_app" "$TMP/saida" || falha "resumo dos logins"
grep -q -- "-v runtime=plugga_rt_app -v auth=plugga_auth_app -v jobs=plugga_jobs_app" "$TMP/args-recebidos" || falha "os nomes vão por variável do psql"
grep -q ":'runtime'" "$TMP/sql-recebido" || falha "o SQL usa a variável, sem colar o nome"
[ "$(wc -l <"$TMP/conexoes")" -eq 3 ] || falha "testa a conexão dos três"
grep -q "plugga_auth_app teste@teste:teste/teste%teste=" "$TMP/conexoes" || falha "a senha vai pelo stdin"
for SENHA in "teste=teste=teste" "teste@teste:teste/teste%teste=" "abc123"; do
  grep -qF -- "$SENHA" "$TMP/saida" && falha "o preflight imprimiu uma senha"
done
ok "com tudo certo: confere no banco por variável, testa as três conexões pelo stdin e não imprime senha"

BANCO_RESPONDE=$'runtime|o login plugga_rt_app tem permissão direta antiga em tabela, sequência ou view (use um login novo)\njobs|o login plugga_jobs_app não existe no banco'
: >"$TMP/conexoes"
if confere_logins_do_banco "$TMP/env" plugga_os >"$TMP/saida" 2>&1; then falha "preflight com problema no banco deveria reprovar"; fi
grep -q "pool runtime: o login plugga_rt_app tem permissão direta antiga" "$TMP/saida" || falha "mensagem da permissão antiga"
grep -q "pool jobs: o login plugga_jobs_app não existe" "$TMP/saida" || falha "mensagem do login ausente"
[ ! -s "$TMP/conexoes" ] || falha "com problema no banco, nem tenta conectar"
ok "problema no banco reprova com uma linha por pool, sem tentar conectar"

BANCO_RESPONDE=""
CONECTA_FALHA=plugga_auth_app
if confere_logins_do_banco "$TMP/env" plugga_os >"$TMP/saida" 2>&1; then falha "login que não conecta deveria reprovar"; fi
grep -q "pool auth: o login plugga_auth_app não conectou com a senha do .env" "$TMP/saida" || falha "mensagem da senha errada"
CONECTA_FALHA=""
ok "senha errada no .env reprova, apontando o pool"

rm -f "$TMP/sql-recebido"; : >"$TMP/conexoes"
if confere_logins_do_banco "$TMP/env-incompleto" plugga_os >"$TMP/saida" 2>&1; then falha ".env incompleto deveria reprovar"; fi
[ ! -e "$TMP/sql-recebido" ] && [ ! -s "$TMP/conexoes" ] || falha ".env incompleto não deveria consultar o banco nem conectar"
ok ".env incompleto reprova antes de consultar o banco"

# ---------------------------------------------------- reversão bloqueada
MIGRACAO_DO_ISOLAMENTO=20261106010000_isolamento_rls
grep -q "migration_name = '20261106010000_isolamento_rls'" <<<"$(sql_isolamento_aplicado)" || falha "a consulta do isolamento procura a migração do RLS"
ISOLAMENTO_ANTES=0
reversao_bloqueada || falha "publicação que liga o RLS: a reversão fica bloqueada, migrando ou não (o .env já tem os logins novos)"
ISOLAMENTO_ANTES=""
reversao_bloqueada || falha "sem saber se o banco tinha o RLS: na dúvida, bloqueia"
ISOLAMENTO_ANTES=1
if reversao_bloqueada; then falha "o banco já tinha o RLS: a reversão segue como antes"; fi
BANCO_RESPONDE=1; banco_ja_migrado_para_rls || falha "o banco já migrado é reconhecido"
BANCO_RESPONDE=0; if banco_ja_migrado_para_rls; then falha "o banco ainda sem o RLS é reconhecido"; fi
ok "a reversão da imagem fica bloqueada em toda a publicação que liga o RLS (e na dúvida); a mensagem sabe se o banco já migrou"

# ---------------------------------------------- a ordem dos passos no deploy.sh
D="$RAIZ/ops/deploy.sh"
linha() { grep -n -- "$1" "$D" | head -1 | cut -d: -f1; }
PRE=$(linha 'confere_logins_do_banco /opt/plugga-os/.env')
SO=$(linha 'conferência ok: os três logins')
BACKUP=$(linha '1/6 · backup do banco')
STOP=$(linha 'docker compose stop api web$')
MIGRA=$(linha 'api pnpm db:migrate:deploy')
ANTES=$(linha 'ISOLAMENTO_ANTES=$(psql_como_dono')
PAPEIS=$(linha 'configura_papeis_da_aplicacao ops/configurar-papeis-aplicacao.sql')
POOLS=$(linha 'verificar-pools-do-banco.mjs$')
UP=$(linha 'docker compose --profile app up -d')
for v in PRE SO BACKUP STOP MIGRA ANTES PAPEIS POOLS UP; do [ -n "${!v}" ] || falha "passo $v não achado no deploy.sh"; done
[ "$PRE" -lt "$BACKUP" ] && [ "$PRE" -lt "$STOP" ] || falha "o preflight vem antes do backup e de parar a aplicação"
[ "$SO" -lt "$BACKUP" ] || falha "--so-conferir sai antes do backup"
[ "$ANTES" -lt "$STOP" ] && [ "$ANTES" -lt "$BACKUP" ] || falha "o estado do RLS é lido no passo 0, antes de parar a aplicação"
[ "$MIGRA" -lt "$PAPEIS" ] && [ "$PAPEIS" -lt "$POOLS" ] && [ "$POOLS" -lt "$UP" ] || falha "migra → papéis → validador → sobe"
grep -q 'if \[ "\$SO_CONFERIR" -eq 0 \]; then' "$D" || falha "--so-conferir não toma a trava"
grep -q 'if reversao_bloqueada; then' "$D" || falha "falha_publicacao consulta o bloqueio da reversão"
ok "deploy.sh: preflight → backup → parar → migrar → papéis → validador → subir; --so-conferir sai antes de tudo"

if bash "$D" --parametro-errado >/dev/null 2>"$TMP/uso"; then falha "parâmetro desconhecido deveria recusar"; fi
grep -q "uso:" "$TMP/uso" || falha "parâmetro desconhecido mostra o uso"
ok "parâmetro desconhecido mostra o uso e não faz nada"

# O script de papéis segue idempotente e validando antes de conceder.
grep -q "Validar todos antes de conceder" "$RAIZ/ops/configurar-papeis-aplicacao.sql" || falha "configurar-papeis valida antes de conceder"
ok "configurar-papeis-aplicacao.sql valida os três antes de conceder"
