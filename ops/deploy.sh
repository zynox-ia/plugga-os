#!/usr/bin/env bash
#
# Publica o Plugga OS na VPS.
#
# Roda **na VPS**, dentro de /opt/plugga-os, depois que o código novo já foi
# copiado para lá. Faz os seis passos na ordem que importa:
#
#   1. backup do banco
#   2. guarda a imagem atual, para poder voltar
#   3. constrói as imagens novas
#   4. migra o banco
#   5. sobe api e web
#   6. teste de fumaça — e volta atrás se falhar
#
# A ordem do 4 antes do 5 é a razão de este script existir. Em 2026-08-09 a
# migração foi aplicada de manhã e o aplicativo só à noite: o banco ficou com o
# esquema novo e o programa procurando uma tabela que não existia mais. Duas
# horas sem login, porque eram dois atos separados que dependiam de alguém
# lembrar da ordem. Aqui são um só.
set -euo pipefail

cd /opt/plugga-os

RAIZ=/opt/plugga-os
SITE=${SITE_URL:-https://os.plugga.app.br}
BANCO=plugga_os

registro() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
falhou() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------- 1. backup
registro "1/6 · backup do banco"
if [ -x /root/backup-plugga.sh ]; then
  /root/backup-plugga.sh
else
  falhou "backup-plugga.sh não encontrado — publicar sem cópia é risco que não vale"
  exit 1
fi

# --------------------------------------------- 2. guarda a imagem para voltar
# Marcar a imagem atual é o que torna a reversão instantânea: sem isso, voltar
# significaria reconstruir a versão antiga, que leva minutos com o site fora.
registro "2/6 · guardando a versão atual para poder voltar"
for servico in api web; do
  if docker image inspect "plugga-os-${servico}:latest" >/dev/null 2>&1; then
    docker tag "plugga-os-${servico}:latest" "plugga-os-${servico}:anterior"
    echo "  plugga-os-${servico}:anterior marcada"
  fi
done

# ------------------------------------------------------------ 3. construção
registro "3/6 · construindo as imagens"
docker compose build api web

# -------------------------------------------------------------- 4. migração
# O papel da aplicação (plugga_app) não tem permissão para criar tabela — é a
# trava criada depois do incidente de perda de dados. Migração roda como dono,
# com a senha lida do próprio contêiner e nunca impressa.
registro "4/6 · migrando o banco"
# `printenv` dentro do contêiner, não `docker inspect` com template split "=":
# o split cortava a senha no primeiro '=' — e senha gerada em base64 tem '='.
SENHA_DONO=$(docker exec plugga-os-postgres-1 printenv POSTGRES_PASSWORD || true)

if [ -z "$SENHA_DONO" ]; then
  falhou "não foi possível ler a credencial do dono do banco"
  exit 1
fi

# A senha entra numa URL: '@', ':', '/' ou '%' crus mudariam o sentido dela.
# Percent-encoding em bash puro porque é o único intérprete que este script
# garante na VPS — jq e python3 não são pressupostos em lugar nenhum daqui.
codifica_url() {
  local LC_ALL=C texto=$1 i c saida=
  for ((i = 0; i < ${#texto}; i++)); do
    c=${texto:i:1}
    case "$c" in
      [A-Za-z0-9._~-]) saida+=$c ;;
      *) printf -v c '%%%02X' "'$c"; saida+=$c ;;
    esac
  done
  printf '%s' "$saida"
}
SENHA_ENC=$(codifica_url "$SENHA_DONO")

# Dentro da rede do compose o host do banco é "postgres", que a trava do
# run-local-prisma aceita.
docker compose run --rm --no-deps \
  -e DATABASE_URL="postgresql://${BANCO}:${SENHA_ENC}@postgres:5432/${BANCO}?schema=public" \
  api pnpm db:migrate:deploy

# ------------------------------------------------------------------ 5. subir
registro "5/6 · subindo api e web"
docker compose up -d api web

# -------------------------------------------------------- 6. teste de fumaça
# Três perguntas, nesta ordem: o site responde? a API responde? e o caminho até
# o banco está inteiro? A terceira é a que pegaria o problema de 2026-08-09 —
# senha errada devolvendo 401 prova que a consulta chegou ao banco e voltou.
# Um 500 aqui significa esquema e programa em desacordo.
registro "6/6 · teste de fumaça"
sleep 15

verifica() {
  local nome="$1" esperado="$2" obtido="$3"
  if [ "$obtido" = "$esperado" ]; then
    echo "  ✓ ${nome}: ${obtido}"
    return 0
  fi
  falhou "${nome}: esperado ${esperado}, obtido ${obtido}"
  return 1
}

ok=0
PAGINA=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${SITE}/login" || echo 000)
verifica "página de login" "200" "$PAGINA" || ok=1

LOGIN=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
  -X POST "${SITE}/api/auth/login" \
  -H 'content-type: application/json' -H "origin: ${SITE}" \
  -d '{"email":"verificacao@deploy.local","password":"senha-errada-de-proposito"}' || echo 000)
verifica "login chega ao banco" "401" "$LOGIN" || ok=1

if [ "$ok" -ne 0 ]; then
  falhou "teste de fumaça reprovou — voltando para a versão anterior"
  for servico in api web; do
    if docker image inspect "plugga-os-${servico}:anterior" >/dev/null 2>&1; then
      docker tag "plugga-os-${servico}:anterior" "plugga-os-${servico}:latest"
    fi
  done
  docker compose up -d api web
  cat >&2 <<AVISO

A versão anterior do programa voltou. O BANCO NÃO FOI REVERTIDO.

Se a falha for de esquema, o backup feito no passo 1 está no MinIO, em
plugga-backups/diario/. Restaurar é decisão humana: entre o backup e agora
pode ter entrado dado que a restauração apagaria.

AVISO
  exit 1
fi

registro "publicado"
docker compose ps --format 'table {{.Name}}\t{{.Status}}' | grep -E 'api|web' || true
