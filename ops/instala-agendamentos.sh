#!/usr/bin/env bash
#
# Instala na VPS os agendamentos e o Caddyfile versionados em ops/cron/ e
# ops/caddy/ (spec 002, US3, FR-014). Idempotente: se o instalado já é igual ao
# versionado, não faz nada; se difere, guarda o anterior como <arquivo>.bak-AAAAMMDD
# (sem sobrescrever um .bak do mesmo dia) e instala o versionado.
#
# Uso:
#   ops/instala-agendamentos.sh            # instala
#   ops/instala-agendamentos.sh --confere  # só compara; sai com erro se algo difere (T058)
#
# Variáveis (padrões da VPS; os testes apontam para pastas temporárias):
#   INSTALA_CRON_DIR   destino dos arquivos de ops/cron/ (padrão /etc/cron.d)
#   INSTALA_CADDYFILE  destino do Caddyfile (padrão /etc/caddy/Caddyfile)
#   INSTALA_RECARREGA_CADDY  comando que recarrega o Caddy depois de instalar um Caddyfile novo;
#                            sem ele, o script só avisa que o Caddy precisa ser recarregado
#   INSTALA_HOJE       AAAAMMDD do .bak (padrão: hoje, UTC)
#
# O que o script NÃO faz: não recarrega o Caddy sozinho, não cria o agendamento do
# backup externo nem da restauração (T059, com aprovação) e não lê segredo algum.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
CRON_ORIGEM=${INSTALA_CRON_ORIGEM:-$RAIZ/ops/cron}
CADDY_ORIGEM=${INSTALA_CADDY_ORIGEM:-$RAIZ/ops/caddy/Caddyfile}
CRON_DIR=${INSTALA_CRON_DIR:-/etc/cron.d}
CADDYFILE=${INSTALA_CADDYFILE:-/etc/caddy/Caddyfile}
HOJE=${INSTALA_HOJE:-$(date -u +%Y%m%d)}
MODO=instala
[ "${1:-}" != "--confere" ] || MODO=confere

registro() { printf '▸ %s\n' "$*"; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }

DIVERGENCIAS=0
CADDY_MUDOU=0

# $1 = versionado, $2 = instalado, $3 = modo do arquivo
sincroniza() {
  local origem=$1 destino=$2 modo=$3
  if [ -f "$destino" ] && cmp -s "$origem" "$destino"; then
    registro "igual: $destino"
    return 0
  fi
  DIVERGENCIAS=$((DIVERGENCIAS + 1))
  if [ "$MODO" = "confere" ]; then
    printf '✗ difere do versionado: %s\n' "$destino" >&2
    return 0
  fi
  if [ -f "$destino" ]; then
    local bak="$destino.bak-$HOJE"
    [ ! -e "$bak" ] || bak="$bak.$(date -u +%H%M%S)"
    cp -p "$destino" "$bak"
    registro "anterior guardado em $bak"
  fi
  mkdir -p "$(dirname "$destino")"
  install -m "$modo" "$origem" "$destino"
  registro "instalado: $destino"
}

# Cron: cada arquivo de ops/cron/ (menos .gitkeep e LEIAME) vira /etc/cron.d/<nome>.
# O cron.d ignora nomes com ponto: recusa-se um arquivo assim em vez de instalar sem efeito.
if [ -d "$CRON_ORIGEM" ]; then
  for arq in "$CRON_ORIGEM"/*; do
    [ -f "$arq" ] || continue
    nome=$(basename "$arq")
    case "$nome" in .gitkeep | LEIAME*) continue ;; esac
    case "$nome" in *.*) falha "nome inválido para o cron.d (o cron ignora nomes com ponto): $nome" ;; esac
    [ -s "$arq" ] || falha "arquivo de cron vazio: $nome"
    sincroniza "$arq" "$CRON_DIR/$nome" 644
  done
fi

if [ -f "$CADDY_ORIGEM" ]; then
  [ -s "$CADDY_ORIGEM" ] || falha "Caddyfile versionado vazio: $CADDY_ORIGEM"
  antes=$DIVERGENCIAS
  sincroniza "$CADDY_ORIGEM" "$CADDYFILE" 644
  [ "$DIVERGENCIAS" -eq "$antes" ] || CADDY_MUDOU=1
fi

if [ "$MODO" = "confere" ]; then
  [ "$DIVERGENCIAS" -eq 0 ] || falha "$DIVERGENCIAS arquivo(s) diferem do versionado"
  printf '✓ o instalado é igual ao versionado\n'
  exit 0
fi

if [ "$CADDY_MUDOU" -eq 1 ]; then
  if [ -n "${INSTALA_RECARREGA_CADDY:-}" ]; then
    registro "recarregando o Caddy"
    bash -c "$INSTALA_RECARREGA_CADDY" || falha "o Caddy não recarregou; o anterior está em $CADDYFILE.bak-$HOJE"
  else
    registro "Caddyfile novo instalado: recarregue o Caddy (INSTALA_RECARREGA_CADDY não definido)"
  fi
fi
printf '✓ agendamentos: %s arquivo(s) instalado(s)\n' "$DIVERGENCIAS"
