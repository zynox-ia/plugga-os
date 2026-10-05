#!/usr/bin/env bash
#
# Prova a trava de publicação (US1, FR-005): duas execuções simultâneas, a
# segunda recusa; terminada a primeira, uma nova passa. Não precisa de Docker
# nem de VPS: usa só o lib-trava.sh com um arquivo de trava temporário.
#
# Uso: bash ops/deploy-trava.test.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export PLUGGA_DEPLOY_LOCK="$TMP/trava.lock"
unset PLUGGA_DEPLOY_LOCK_HELD

falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

# Simula uma publicação: toma a trava, avisa que começou e segura por N segundos.
cat >"$TMP/publicacao.sh" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
. "$RAIZ/ops/lib-trava.sh"
adquire_trava_de_deploy || exit 1
touch "$TMP/\$1.comecou"
sleep "\${2:-0}"
SCRIPT

bash "$TMP/publicacao.sh" primeira 4 &
PRIMEIRA=$!
for _ in $(seq 1 50); do [ -f "$TMP/primeira.comecou" ] && break; sleep 0.1; done
[ -f "$TMP/primeira.comecou" ] || falha "a primeira publicação não começou"

if bash "$TMP/publicacao.sh" segunda 0 2>"$TMP/segunda.err"; then
  falha "a segunda publicação simultânea deveria recusar"
fi
grep -q "publicação em andamento" "$TMP/segunda.err" || falha "a recusa não explicou o motivo"
[ ! -f "$TMP/segunda.comecou" ] || falha "a segunda publicação chegou a começar"
ok "a segunda publicação simultânea recusa, com mensagem"

wait "$PRIMEIRA" || falha "a primeira publicação falhou"
bash "$TMP/publicacao.sh" terceira 0 || falha "depois de terminar, uma nova publicação deveria passar"
ok "terminada a primeira, uma nova passa (a trava morre com o processo)"

# Quem já segura a trava (publicar.sh) não trava de novo contra si mesmo.
bash "$TMP/publicacao.sh" quarta 3 &
QUARTA=$!
for _ in $(seq 1 50); do [ -f "$TMP/quarta.comecou" ] && break; sleep 0.1; done
PLUGGA_DEPLOY_LOCK_HELD=1 bash "$TMP/publicacao.sh" quinta 0 || falha "PLUGGA_DEPLOY_LOCK_HELD=1 deveria dispensar a trava"
wait "$QUARTA"
ok "PLUGGA_DEPLOY_LOCK_HELD=1 dispensa a trava de quem a herdou do publicar.sh"

# Os dois scripts reais têm de usar a trava, e antes do backup.
grep -q "adquire_trava_de_deploy" "$RAIZ/ops/deploy.sh" || falha "deploy.sh não usa a trava"
LINHA_TRAVA=$(grep -n "adquire_trava_de_deploy" "$RAIZ/ops/deploy.sh" | head -1 | cut -d: -f1)
LINHA_BACKUP=$(grep -n "1/6 · backup" "$RAIZ/ops/deploy.sh" | head -1 | cut -d: -f1)
[ "$LINHA_TRAVA" -lt "$LINHA_BACKUP" ] || falha "a trava precisa vir antes do backup no deploy.sh"
grep -q "flock -n 9" "$RAIZ/ops/publicar.sh" || falha "publicar.sh não toma a trava"
grep -q "PLUGGA_DEPLOY_LOCK_HELD=1" "$RAIZ/ops/publicar.sh" || falha "publicar.sh não repassa que segura a trava"
ok "deploy.sh e publicar.sh usam a trava, antes de qualquer passo"
