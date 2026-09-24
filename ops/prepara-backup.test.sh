#!/usr/bin/env bash
#
# Ensaio de ops/prepara-backup.sh contra um SeaweedFS (modo mini) descartável.
# Precisa do Docker. Prova o que interessa de um usuário restrito: ele escreve
# no balde de backup, é NEGADO em outro balde, e rodar de novo não estraga nada.
#
# Uso: bash ops/prepara-backup.test.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
# Senha descartável desta execução: nada de segredo escrito no repositório.
ENSAIO_SEGREDO=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d '[:space:]')
export ENSAIO_SEGREDO
cd "$RAIZ"
COMPOSE=(docker compose -f compose.ensaio-storage.yaml)
ENV_BACKUP=$(mktemp)
rm -f "$ENV_BACKUP" # o script cria o arquivo; o teste só reserva o nome
SAIDA=$(mktemp)

limpa() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; rm -f "$ENV_BACKUP" "$SAIDA"; }
trap limpa EXIT

mc() { "${COMPOSE[@]}" exec -T mc mc "$@" </dev/null; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

echo "▸ subindo SeaweedFS descartável"
"${COMPOSE[@]}" up -d seaweedfs mc >/dev/null 2>&1 || falha "docker compose up falhou"
for _ in $(seq 1 40); do mc ls dest >/dev/null 2>&1 && pronto=1 && break; sleep 2; done
[ "${pronto:-0}" = 1 ] || falha "SeaweedFS não ficou pronto"
mc mb --ignore-existing dest/plugga-energia-opm >/dev/null

export REDE=ensaio-storage_default SEAWEEDFS_CONTAINER=ensaio-storage-seaweedfs-1 ARQUIVO_ENV_BACKUP="$ENV_BACKUP"

# 1. primeira execução
bash ops/prepara-backup.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "prepara-backup.sh falhou"; }
grep -q "destino preparado" "$SAIDA" || falha "não confirmou o destino"
ok "primeira execução prepara o destino"

# shellcheck disable=SC1090
. "$ENV_BACKUP"
if grep -q "$BACKUP_SECRET_KEY" "$SAIDA"; then falha "o segredo do backup vazou na saída"; fi
ok "segredo do backup não aparece na saída"

# 2. o usuário restrito: escreve no backup, é negado nos demais
export MC_HOST_bk="http://${BACKUP_ACCESS_KEY}:${BACKUP_SECRET_KEY}@seaweedfs:8333"
no_mc() { "${COMPOSE[@]}" exec -T -e MC_HOST_bk="$MC_HOST_bk" mc sh -c "$1" </dev/null; }
no_mc 'echo x > /tmp/f && mc cp /tmp/f bk/plugga-backups/diario/teste.dump' >/dev/null 2>&1 || falha "usuário de backup não grava em plugga-backups"
ok "usuário de backup grava em plugga-backups"
if no_mc 'echo x > /tmp/f && mc cp /tmp/f bk/plugga-energia-opm/faturas/invasao' >/dev/null 2>&1; then
  falha "usuário de backup conseguiu gravar em plugga-energia-opm"
fi
ok "usuário de backup é NEGADO em plugga-energia-opm"
if no_mc 'mc cat bk/plugga-energia-opm/faturas/qualquer' >/dev/null 2>&1; then
  falha "usuário de backup leu de plugga-energia-opm"
fi
ok "usuário de backup não lê o balde de negócio"

# 3. expiração
REGRAS=$(mc ilm rule ls dest/plugga-backups 2>&1)
case "$REGRAS" in *"diario/"*) ;; *) falha "sem regra de expiração de diario/" ;; esac
case "$REGRAS" in *"mensal/"*) ;; *) falha "sem regra de expiração de mensal/" ;; esac
ok "regras de expiração diario/ e mensal/ presentes"

# 4. idempotente: mesmo segredo, mesmo resultado
ANTES=$(cat "$ENV_BACKUP")
bash ops/prepara-backup.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "segunda execução falhou"; }
[ "$ANTES" = "$(cat "$ENV_BACKUP")" ] || falha "segunda execução trocou a credencial"
no_mc 'echo y > /tmp/f && mc cp /tmp/f bk/plugga-backups/diario/teste2.dump' >/dev/null 2>&1 || falha "usuário deixou de gravar após reexecução"
ok "reexecução é idempotente e a credencial continua valendo"

echo
echo "TODOS OS CASOS PASSARAM"
