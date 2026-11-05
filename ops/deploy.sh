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
#   4. pausa escritores, faz backup final e migra o banco
#   5. sobe api e web
#   6. teste de fumaça — e volta atrás se falhar
#
# A ordem do 4 antes do 5 é a razão de este script existir. Em 2026-08-09 a
# migração foi aplicada de manhã e o aplicativo só à noite: o banco ficou com o
# esquema novo e o programa procurando uma tabela que não existia mais. Duas
# horas sem login, porque eram dois atos separados que dependiam de alguém
# lembrar da ordem. Aqui são um só.
set -Eeuo pipefail

# Uma publicação por vez: antes de qualquer passo, inclusive o backup.
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib-trava.sh"
adquire_trava_de_deploy || exit 1

cd /opt/plugga-os

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
registro "4/6 · preparando a janela de migração"
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

# Um programa antigo não lê negócios novos sem cliente. Se não for possível
# provar a compatibilidade, preserva as tags atuais e tenta reativá-las.
recusa_reversao() {
  falhou "$1 Reversão automática recusada; intervenção do André necessária."
  if ! docker compose up -d --no-deps --no-build api web; then
    falhou "A versão atual também não subiu; reativação manual necessária."
  fi
  return 1
}

reativa_versao_anterior() {
  # Fecha a corrida entre conferir o banco e trocar as imagens, inclusive se
  # a versão nova já estava atendendo durante o teste de fumaça.
  docker compose stop api web || return 1
  local sem_cliente
  if ! sem_cliente=$(docker exec plugga-os-postgres-1 psql -U "$BANCO" -d "$BANCO" -Atqc \
    'SELECT EXISTS (SELECT 1 FROM deals WHERE client_id IS NULL);'); then
    recusa_reversao "Não foi possível conferir a compatibilidade do banco."
    return 1
  fi
  if [ "$sem_cliente" != "f" ]; then
    recusa_reversao "Há negócio sem cliente ou resposta de compatibilidade desconhecida."
    return 1
  fi
  for servico in api web; do
    if ! docker image inspect "plugga-os-${servico}:anterior" >/dev/null 2>&1; then
      recusa_reversao "A imagem anterior de ${servico} não está disponível."
      return 1
    fi
  done
  for servico in api web; do
    docker tag "plugga-os-${servico}:anterior" "plugga-os-${servico}:latest" || return 1
  done
  docker compose up -d --no-deps --no-build api web || return 1
  falhou "A versão anterior do programa voltou. O BANCO NÃO FOI REVERTIDO."
}

falha_publicacao() {
  local codigo=$1
  trap - ERR
  falhou "A publicação falhou; tentando reativar a aplicação sem alterar banco ou armazenamento."
  if ! reativa_versao_anterior; then
    falhou "Recuperação automática incompleta; intervenção do André necessária. O banco não foi restaurado."
  fi
  exit "$codigo"
}

# O backup final e o backfill precisam da mesma janela sem escritores. O trap
# só começa aqui: falhar no build não interrompe a aplicação que está atendendo.
trap 'falha_publicacao "$?"' ERR
registro "4/6 · parando api/web e fazendo o backup final"
docker compose stop api web
/root/backup-plugga.sh

# Dentro da rede do compose o host do banco é "postgres", que a trava do
# run-local-prisma aceita.
registro "4/6 · migrando o banco sem escritores"
docker compose run --rm --no-deps \
  -e NODE_ENV=production \
  -e ALLOW_PRODUCTION_MIGRATION=true \
  -e DATABASE_URL="postgresql://${BANCO}:${SENHA_ENC}@postgres:5432/${BANCO}?schema=public" \
  api pnpm db:migrate:deploy

# Confere os grants do papel da aplicação antes de aceitar tráfego novo.
docker compose run --rm --no-deps -T api node --input-type=module - --verificar-permissoes-crm < ops/verificar-permissoes-crm.mjs

# ------------------------------------------------------------------ 5. subir
# Sem nomear serviço: agora que o compose.yaml é sincronizado do repositório,
# uma mudança no bloco de postgres/redis/rustfs chegaria ao arquivo e nunca aos
# contêineres — uma divergência mais silenciosa que a que acabamos de fechar.
#
# `--profile app` é obrigatório e não é zelo: api e web declaram
# `profiles: ["app"]`, e sem ele o compose sobe só a infraestrutura e deixa a
# aplicação de fora — o deploy passaria sem publicar nada.
#
# Isto não reinicia o que não mudou: o compose compara o `config-hash` de cada
# contêiner e só recria os divergentes. Conferido com `--dry-run` em produção
# em 10/08/2026, com os cinco serviços reportados como `Running`.
registro "5/6 · subindo a aplicação"
docker compose --profile app up -d

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
  falhou "teste de fumaça reprovou"
  falha_publicacao 1
fi

trap - ERR
registro "publicado"
docker compose ps --format 'table {{.Name}}\t{{.Status}}' | grep -E 'api|web' || true
