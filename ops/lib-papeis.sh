#!/usr/bin/env bash
#
# Os três logins do banco da aplicação (runtime, auth e jobs), para o deploy.sh.
#
# Desde o isolamento por RLS (migration 20261106010000), a API conecta com três
# logins distintos, cada um membro de um só grupo (plugga_runtime,
# plugga_auth_runtime, plugga_jobs_runtime), e recusa subir se algum deles tiver
# mais do que deve. Esta biblioteca confere isso ANTES de o deploy parar qualquer
# coisa, e configura os grupos depois da migração. Nenhuma função imprime senha.
#
# Sem Docker nos testes: as consultas passam por `psql_como_dono` e
# `conecta_como`, que o ops/deploy-papeis.test.sh substitui.

# shellcheck disable=SC2034  # variáveis lidas pelo deploy.sh

# Lê VAR do .env sem executar o arquivo (o .env pode ter valor com espaço, aspas
# ou `$`): a última atribuição vale, como no `docker compose`. Aspas simples ou
# duplas em volta do valor saem.
valor_do_env() {
  local arquivo=$1 variavel=$2 linha valor=
  [ -f "$arquivo" ] || return 0
  while IFS= read -r linha || [ -n "$linha" ]; do
    linha=${linha%$'\r'}
    case "$linha" in
      "$variavel="*) valor=${linha#"$variavel="} ;;
    esac
  done <"$arquivo"
  case "$valor" in
    \"*\") valor=${valor#\"}; valor=${valor%\"} ;;
    \'*\') valor=${valor#\'}; valor=${valor%\'} ;;
  esac
  printf '%s' "$valor"
}

# Percent-decoding em bash puro (o usuário e a senha numa URL vêm codificados). A barra
# invertida crua é dobrada antes, para o `%b` não ler `\n` ou `\t` da senha como escape.
decodifica_url() {
  local texto=${1//\\/\\\\}
  printf '%b' "${texto//%/\\x}"
}

# postgresql://USUARIO:SENHA@HOST:PORTA/BANCO?... → partes, decodificadas.
# Saída vazia quando a URL não tem o formato esperado.
usuario_da_url() {
  local url=$1 resto credenciais
  case "$url" in postgresql://*@* | postgres://*@*) ;; *) return 0 ;; esac
  resto=${url#*://}
  credenciais=${resto%%@*}
  decodifica_url "${credenciais%%:*}"
}

senha_da_url() {
  local url=$1 resto credenciais
  case "$url" in postgresql://*@* | postgres://*@*) ;; *) return 0 ;; esac
  resto=${url#*://}
  credenciais=${resto%%@*}
  case "$credenciais" in *:*) decodifica_url "${credenciais#*:}" ;; esac
}

# Os três pools, a partir do .env da VPS. O runtime é o APP_DB_USER/APP_DB_PASSWORD
# (o compose monta a DATABASE_URL com eles); auth e jobs são URLs completas.
# Preenche LOGIN_RUNTIME, LOGIN_AUTH, LOGIN_JOBS e as senhas, sem imprimir.
le_logins_do_env() {
  local arquivo=$1
  LOGIN_RUNTIME=$(valor_do_env "$arquivo" APP_DB_USER)
  LOGIN_RUNTIME=${LOGIN_RUNTIME:-plugga_app}
  SENHA_RUNTIME=$(valor_do_env "$arquivo" APP_DB_PASSWORD)
  URL_AUTH=$(valor_do_env "$arquivo" AUTH_DATABASE_URL)
  URL_JOBS=$(valor_do_env "$arquivo" JOBS_DATABASE_URL)
  LOGIN_AUTH=$(usuario_da_url "$URL_AUTH")
  SENHA_AUTH=$(senha_da_url "$URL_AUTH")
  LOGIN_JOBS=$(usuario_da_url "$URL_JOBS")
  SENHA_JOBS=$(senha_da_url "$URL_JOBS")
}

# O que o .env precisa ter, antes de olhar o banco. Uma linha por problema.
problemas_do_env() {
  local dono=$1
  [ -n "$SENHA_RUNTIME" ] || echo "APP_DB_PASSWORD ausente no .env (senha do login runtime)."
  [ -n "$URL_AUTH" ] || echo "AUTH_DATABASE_URL ausente no .env."
  [ -n "$URL_JOBS" ] || echo "JOBS_DATABASE_URL ausente no .env."
  if [ -n "$URL_AUTH" ] && { [ -z "$LOGIN_AUTH" ] || [ -z "$SENHA_AUTH" ]; }; then
    echo "AUTH_DATABASE_URL sem usuário e senha no formato postgresql://usuario:senha@postgres:5432/${dono}."
  fi
  if [ -n "$URL_JOBS" ] && { [ -z "$LOGIN_JOBS" ] || [ -z "$SENHA_JOBS" ]; }; then
    echo "JOBS_DATABASE_URL sem usuário e senha no formato postgresql://usuario:senha@postgres:5432/${dono}."
  fi
  local nome
  for nome in "$LOGIN_RUNTIME" "$LOGIN_AUTH" "$LOGIN_JOBS"; do
    [ -z "$nome" ] && continue
    if ! [[ $nome =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
      echo "Login '${nome}' fora do formato (minúsculas, números e _; começa com letra)."
    elif [ "$nome" = "$dono" ]; then
      echo "O login '${nome}' é o dono do banco: a aplicação nunca usa o migrador."
    fi
  done
  if [ -n "$LOGIN_AUTH" ] && [ -n "$LOGIN_JOBS" ] &&
    { [ "$LOGIN_RUNTIME" = "$LOGIN_AUTH" ] || [ "$LOGIN_RUNTIME" = "$LOGIN_JOBS" ] || [ "$LOGIN_AUTH" = "$LOGIN_JOBS" ]; }; then
    echo "Os três logins (APP_DB_USER, AUTH_DATABASE_URL e JOBS_DATABASE_URL) precisam ser distintos."
  fi
}

# A consulta, como dono, sobre os três logins. Uma linha "pool|problema" por falha.
# Os nomes entram por variável do psql (:'runtime'), nunca colados no SQL.
SQL_PROBLEMAS_DOS_LOGINS=$(cat <<'SQL'
WITH pools(pool, login, grupo) AS (VALUES
  ('runtime', :'runtime', 'plugga_runtime'),
  ('auth', :'auth', 'plugga_auth_runtime'),
  ('jobs', :'jobs', 'plugga_jobs_runtime')),
alvos AS (SELECT p.pool, p.login, p.grupo, r.oid, r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit
  FROM pools p LEFT JOIN pg_catalog.pg_roles r ON r.rolname = p.login),
problemas AS (
  SELECT pool, 'o login ' || login || ' não existe no banco' AS problema FROM alvos WHERE oid IS NULL
  UNION ALL SELECT pool, 'o login ' || login || ' não pode conectar (falta LOGIN)' FROM alvos WHERE oid IS NOT NULL AND NOT rolcanlogin
  UNION ALL SELECT pool, 'o login ' || login || ' precisa de INHERIT' FROM alvos WHERE oid IS NOT NULL AND NOT rolinherit
  UNION ALL SELECT pool, 'o login ' || login || ' tem SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB ou REPLICATION'
    FROM alvos WHERE oid IS NOT NULL AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)
  UNION ALL SELECT a.pool, 'o login ' || a.login || ' é o dono do banco ou membro dele'
    FROM alvos a WHERE a.oid IS NOT NULL AND (a.login = current_user OR pg_catalog.pg_has_role(a.oid, current_user, 'MEMBER'))
  UNION ALL SELECT a.pool, 'o login ' || a.login || ' herda o papel ' || g.rolname || ' (só pode herdar ' || a.grupo || ')'
    FROM alvos a JOIN pg_catalog.pg_auth_members m ON m.member = a.oid JOIN pg_catalog.pg_roles g ON g.oid = m.roleid
    WHERE g.rolname <> a.grupo
  UNION ALL SELECT DISTINCT a.pool, 'o login ' || a.login || ' tem permissão direta antiga em tabela, sequência ou view (use um login novo)'
    FROM alvos a JOIN pg_catalog.pg_class c ON c.relacl IS NOT NULL
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname IN ('public', 'plugga_security')
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x WHERE x.grantee = a.oid
  UNION ALL SELECT DISTINCT a.pool, 'o login ' || a.login || ' tem permissão direta antiga em função (use um login novo)'
    FROM alvos a JOIN pg_catalog.pg_proc f ON f.proacl IS NOT NULL
    JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace AND n.nspname IN ('public', 'plugga_security')
    CROSS JOIN LATERAL pg_catalog.aclexplode(f.proacl) x WHERE x.grantee = a.oid
  UNION ALL SELECT DISTINCT a.pool, 'o login ' || a.login || ' recebe permissões padrão (ALTER DEFAULT PRIVILEGES) (use um login novo)'
    FROM alvos a JOIN pg_catalog.pg_default_acl d ON true CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x WHERE x.grantee = a.oid
  UNION ALL SELECT DISTINCT a.pool, 'o login ' || a.login || ' é dono de objeto do banco'
    FROM alvos a JOIN pg_catalog.pg_class c ON c.relowner = a.oid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname IN ('public', 'plugga_security')
  UNION ALL SELECT a.pool, 'o login ' || a.login || ' pode criar objetos no banco (CREATE)'
    FROM alvos a WHERE a.oid IS NOT NULL AND (pg_catalog.has_database_privilege(a.oid, current_database(), 'CREATE')
      OR pg_catalog.has_schema_privilege(a.oid, 'public', 'CREATE'))
)
SELECT pool || '|' || problema FROM problemas ORDER BY 1;
SQL
)

# Problemas dos logins no banco (uma linha por problema), via psql_como_dono.
problemas_no_banco() {
  psql_como_dono -v runtime="$LOGIN_RUNTIME" -v auth="$LOGIN_AUTH" -v jobs="$LOGIN_JOBS" <<<"$SQL_PROBLEMAS_DOS_LOGINS"
}

# Cada login conecta com a senha do .env? A senha vai pelo stdin, nunca na linha de comando.
problemas_de_conexao() {
  local pool login senha
  for pool in runtime auth jobs; do
    case "$pool" in
      runtime) login=$LOGIN_RUNTIME; senha=$SENHA_RUNTIME ;;
      auth) login=$LOGIN_AUTH; senha=$SENHA_AUTH ;;
      jobs) login=$LOGIN_JOBS; senha=$SENHA_JOBS ;;
    esac
    if ! conecta_como "$login" <<<"$senha" >/dev/null 2>&1; then
      echo "${pool}|o login ${login} não conectou com a senha do .env"
    fi
  done
}

# O preflight inteiro. Devolve 0 se tudo certo; senão imprime cada problema e devolve 1.
confere_logins_do_banco() {
  local env=$1 dono=$2 problemas
  le_logins_do_env "$env"
  problemas=$(problemas_do_env "$dono")
  if [ -z "$problemas" ]; then
    if ! problemas=$(problemas_no_banco); then
      problemas="não foi possível consultar os papéis no banco"
    fi
    if [ -z "$problemas" ]; then
      problemas=$(problemas_de_conexao)
    fi
  fi
  if [ -n "$problemas" ]; then
    printf '%s\n' "$problemas" | sed 's/^\(runtime\|auth\|jobs\)|/  pool \1: /; t; s/^/  /' >&2
    return 1
  fi
  echo "  logins da aplicação: runtime=${LOGIN_RUNTIME}, auth=${LOGIN_AUTH}, jobs=${LOGIN_JOBS}"
}

# A migração do RLS (MIGRACAO_DO_ISOLAMENTO) já estava no banco ANTES desta publicação?
# "1" = sim; "0" = esta é a publicação que a liga. Lida no passo 0, antes de parar
# qualquer coisa.
sql_isolamento_aplicado() {
  printf "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '%s' AND finished_at IS NOT NULL" "$MIGRACAO_DO_ISOLAMENTO"
}

# Na publicação que liga o RLS (ou se não deu para saber), a reversão automática da
# imagem fica bloqueada, migrando ou não: o .env já aponta os três logins novos, que a
# versão anterior (um pool só) não sabe usar, e depois da migração ela nem enxergaria o
# banco. Religar a versão antiga daria um site de pé errando toda consulta.
reversao_bloqueada() {
  [ "${ISOLAMENTO_ANTES:-}" != "1" ]
}

# O banco já recebeu a migração do RLS? Para a mensagem da falha: diz se há o que restaurar.
banco_ja_migrado_para_rls() {
  local agora
  agora=$(psql_como_dono -c "$(sql_isolamento_aplicado)" 2>/dev/null) || return 2
  [ "$agora" != "0" ]
}

# Depois da migração: concede a cada login o grupo do seu pool, pelo script que valida
# antes de conceder (idempotente: repetir não muda nada).
configura_papeis_da_aplicacao() {
  local script=$1
  psql_como_dono -v runtime_role="$LOGIN_RUNTIME" -v auth_role="$LOGIN_AUTH" -v jobs_role="$LOGIN_JOBS" <"$script"
}
