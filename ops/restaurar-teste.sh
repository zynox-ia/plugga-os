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
#
# Variáveis:
#   RESTAURA_MODO      docker (padrão): sobe um contêiner postgres:16 descartável
#                      servidor: usa um Postgres já no ar (RESTAURA_PGHOST/PORT/USER) e
#                                cria e apaga um banco descartável nele (testes e CI)
#   RESTAURA_TABELAS_MINIMO  mínimo de tabelas no schema public após restaurar (padrão 1)
#   RESTAURA_PGHOST, RESTAURA_PGPORT, RESTAURA_PGUSER  só no modo servidor
#
# Sai com erro (e mensagem) se: o dump não existe ou está vazio, o pg_restore
# falha (dump adulterado ou truncado), ou o banco volta com tabelas de menos.
set -euo pipefail

PG_IMAGEM=${RESTAURA_PG_IMAGEM:-postgres:16-alpine}
MODO=${RESTAURA_MODO:-docker}
MINIMO=${RESTAURA_TABELAS_MINIMO:-1}
ORIGEM=${1:-}
TMP=$(mktemp -d)
CONTEINER=""
BANCO_TESTE="restauracao_$(date -u +%Y%m%d%H%M%S)_$$"

registro() { printf '▸ %s\n' "$*"; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }

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

DUMP=$(escolhe_dump)
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
printf '✓ restauração ok: %s tabelas no schema public\n' "$TABELAS"
