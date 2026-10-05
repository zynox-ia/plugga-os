#!/usr/bin/env bash
#
# Ensaio de ops/instala-agendamentos.sh em pastas temporárias (sem VPS, sem root):
# instala do zero, é idempotente, guarda o anterior como .bak-AAAAMMDD quando o
# instalado difere, --confere aponta divergência, recusa cron com nome inválido
# e só recarrega o Caddy quando o Caddyfile mudou.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

mkdir -p "$TMP/cron" "$TMP/caddy" "$TMP/etc/cron.d" "$TMP/etc/caddy"
printf '10 3 * * * root /opt/plugga-os/ops/backup-plugga.sh\n' >"$TMP/cron/plugga-backup"
printf 'exemplo.test {\n  reverse_proxy web:3000\n}\n' >"$TMP/caddy/Caddyfile"

instala() {
  env INSTALA_CRON_ORIGEM="$TMP/cron" INSTALA_CADDY_ORIGEM="$TMP/caddy/Caddyfile" \
    INSTALA_CRON_DIR="$TMP/etc/cron.d" INSTALA_CADDYFILE="$TMP/etc/caddy/Caddyfile" \
    INSTALA_HOJE=20261005 INSTALA_RECARREGA_CADDY="echo recarregou >>$TMP/recargas" \
    bash "$RAIZ/ops/instala-agendamentos.sh" "$@"
}

# 1. do zero: instala os dois, sem .bak (não havia anterior) e recarrega o Caddy
instala >"$TMP/o1" 2>&1 || { cat "$TMP/o1" >&2; falha "a instalação do zero deveria funcionar"; }
cmp -s "$TMP/cron/plugga-backup" "$TMP/etc/cron.d/plugga-backup" || falha "o cron não foi instalado igual"
cmp -s "$TMP/caddy/Caddyfile" "$TMP/etc/caddy/Caddyfile" || falha "o Caddyfile não foi instalado igual"
[ "$(stat -c %a "$TMP/etc/cron.d/plugga-backup")" = "644" ] || falha "o cron precisa de modo 644"
ls "$TMP"/etc/cron.d/*.bak-* >/dev/null 2>&1 && falha "sem anterior não deveria haver .bak"
[ "$(wc -l <"$TMP/recargas")" = "1" ] || falha "o Caddy deveria recarregar uma vez"
ok "instala do zero (cron e Caddyfile), sem .bak, recarregando o Caddy"

# 2. idempotente: segunda rodada não muda nada, não cria .bak, não recarrega
instala >"$TMP/o2" 2>&1 || falha "a segunda rodada deveria funcionar"
grep -q "0 arquivo(s) instalado(s)" "$TMP/o2" || falha "a segunda rodada deveria instalar 0 arquivos"
ls "$TMP"/etc/cron.d/*.bak-* "$TMP"/etc/caddy/*.bak-* >/dev/null 2>&1 && falha "idempotente não cria .bak"
[ "$(wc -l <"$TMP/recargas")" = "1" ] || falha "sem mudança o Caddy não recarrega"
ok "idempotente: nada muda, sem .bak, sem recarga"

# 3. instalado difere: --confere acusa, instalar guarda o anterior
printf '# editado a mão na VPS\n' >>"$TMP/etc/cron.d/plugga-backup"
if instala --confere >/dev/null 2>"$TMP/e3"; then falha "--confere deveria acusar a divergência"; fi
grep -q "plugga-backup" "$TMP/e3" || falha "--confere não nomeou o arquivo"
instala >/dev/null 2>&1 || falha "reinstalar deveria funcionar"
grep -q "editado a mão" "$TMP/etc/cron.d/plugga-backup.bak-20261005" || falha "o anterior não foi guardado no .bak"
cmp -s "$TMP/cron/plugga-backup" "$TMP/etc/cron.d/plugga-backup" || falha "o versionado não voltou ao lugar"
[ "$(wc -l <"$TMP/recargas")" = "1" ] || falha "mudança só no cron não recarrega o Caddy"
instala --confere >/dev/null 2>&1 || falha "depois de instalar, --confere deveria passar"
ok "divergência: --confere acusa; instalar guarda o anterior em .bak-AAAAMMDD; --confere passa depois"

# 4. nome de cron inválido (com ponto) e arquivo vazio são recusados
printf 'x\n' >"$TMP/cron/ruim.sh"
if instala >/dev/null 2>"$TMP/e4"; then falha "nome com ponto deveria falhar"; fi
grep -q "ponto" "$TMP/e4" || falha "a recusa não explicou o ponto"
rm "$TMP/cron/ruim.sh"
: >"$TMP/cron/vazio"
if instala >/dev/null 2>&1; then falha "cron vazio deveria falhar"; fi
rm "$TMP/cron/vazio"
ok "recusa cron com ponto no nome ou vazio"

# 5. falha do recarregar o Caddy é erro e o anterior fica guardado
printf '# outra versão\n' >>"$TMP/caddy/Caddyfile"
if env INSTALA_CRON_ORIGEM="$TMP/cron" INSTALA_CADDY_ORIGEM="$TMP/caddy/Caddyfile" \
  INSTALA_CRON_DIR="$TMP/etc/cron.d" INSTALA_CADDYFILE="$TMP/etc/caddy/Caddyfile" INSTALA_HOJE=20261005 \
  INSTALA_RECARREGA_CADDY="false" bash "$RAIZ/ops/instala-agendamentos.sh" >/dev/null 2>"$TMP/e5"; then
  falha "recarga com erro deveria falhar"
fi
grep -q "bak-20261005" "$TMP/e5" || falha "a falha não apontou o .bak"
[ -f "$TMP/etc/caddy/Caddyfile.bak-20261005" ] || falha "o Caddyfile anterior deveria estar guardado"
ok "recarga do Caddy com erro falha e aponta o anterior"
