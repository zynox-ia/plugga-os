#!/usr/bin/env bash
#
# Ensaio de ops/migra-storage.sh contra MinIO e SeaweedFS (modo mini) reais e
# descartáveis. Precisa do Docker. Roda quatro casos e sai com erro se algum
# deles não se comportar como o script promete:
#
#   1. caso feliz               -> código 0, conteúdo idêntico no destino
#   2. objeto adulterado        -> código 1 ao conferir
#   3. objeto sem destino       -> código 3
#   4. origem vazia             -> código 2 (nunca "0 = 0 passou")
#
# Uso: bash ops/migra-storage.test.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
# Caminho relativo de propósito: a raiz pode ter espaço no nome (MC_CMD é
# separado por palavras) e o Docker no Windows não entende o caminho do MSYS.
cd "$RAIZ"
COMPOSE=(docker compose -f compose.ensaio-storage.yaml)
export MC_CMD="docker compose -f compose.ensaio-storage.yaml exec -T mc mc"
export MC_HOST_source=ignorado MC_HOST_dest=ignorado # o mc do contêiner tem as suas

limpa() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap limpa EXIT

# shellcheck disable=SC2086
mc() { $MC_CMD "$@"; }
no_conteiner() { "${COMPOSE[@]}" exec -T mc sh -c "$1"; }

esperado() {
  local nome="$1" quer="$2" obteve="$3"
  if [ "$quer" != "$obteve" ]; then
    printf '✗ %s: esperava código %s, veio %s\n' "$nome" "$quer" "$obteve" >&2
    exit 1
  fi
  printf '✓ %s (código %s)\n' "$nome" "$obteve"
}

roda() { set +e; ops/migra-storage.sh "$@" >/tmp/migra-saida.txt 2>&1; CODIGO=$?; set -e; }

echo "▸ subindo MinIO e SeaweedFS descartáveis"
"${COMPOSE[@]}" up -d >/dev/null 2>&1 || { echo "✗ docker compose up falhou" >&2; "${COMPOSE[@]}" up -d 2>&1 | tail -5 >&2; exit 1; }
for _ in $(seq 1 40); do
  if mc ls source >/dev/null 2>&1 && mc ls dest >/dev/null 2>&1; then pronto=1; break; fi
  sleep 2
done
[ "${pronto:-0}" = 1 ] || { echo "✗ servidores não ficaram prontos" >&2; exit 1; }

echo "▸ populando a origem"
no_conteiner '
  set -eu
  for b in plugga-faturas plugga-corpus-faturas plugga-backups; do mc mb --ignore-existing source/$b >/dev/null; done
  mkdir -p /tmp/s && cd /tmp/s
  head -c 320000 /dev/urandom > "06-2026 SANTA TEREZA ç.pdf"
  : > vazio.txt
  head -c 3000000 /dev/urandom > backup.dump
  mc cp "06-2026 SANTA TEREZA ç.pdf" "source/plugga-faturas/faturas/79191abf/06-2026 SANTA TEREZA ç.pdf" >/dev/null
  mc cp vazio.txt source/plugga-faturas/faturas/79191abf/vazio.txt >/dev/null
  for i in 1 2 3 4 5; do head -c $((i*40000)) /dev/urandom > c$i.bin; mc cp c$i.bin source/plugga-corpus-faturas/amazonas-$i.pdf >/dev/null; done
  mc cp backup.dump source/plugga-backups/diario/plugga_os-1.dump >/dev/null
'

# --- 1. caso feliz
roda; esperado "caso feliz" 0 "$CODIGO"
grep -q "copiados" /tmp/migra-saida.txt && grep -q "8 objeto(s) copiados" /tmp/migra-saida.txt || { echo "✗ deveria copiar os 8 objetos: $(grep copiados /tmp/migra-saida.txt)" >&2; exit 1; }
grep -q "conferidos: 8 | divergentes: 0" /tmp/migra-saida.txt || { echo "✗ deveria conferir os 8 objetos" >&2; exit 1; }
echo "✓ 8 objetos copiados e conferidos (nenhum ficou de fora)"
mc ls dest/plugga-energia-opm/faturas/79191abf/ >/dev/null || { echo "✗ fatura não chegou em plugga-energia-opm" >&2; exit 1; }
echo "✓ fatura no balde plugga-energia-opm, mesma chave"

# --- 1b. de novo: idempotente
roda; esperado "reexecução (idempotente)" 0 "$CODIGO"

# --- 2. objeto adulterado no destino: mesmo tamanho, conteúdo diferente
no_conteiner 'head -c 3000000 /dev/zero > /tmp/x && mc cp /tmp/x dest/plugga-backups/diario/plugga_os-1.dump >/dev/null'
roda --so-verificar; esperado "objeto adulterado" 1 "$CODIGO"
grep -q "diverge: plugga-backups/diario/plugga_os-1.dump" /tmp/migra-saida.txt || { echo "✗ a saída não aponta o objeto adulterado" >&2; exit 1; }
roda; esperado "cópia repara o destino" 0 "$CODIGO"

# --- 3. objeto sem destino no mapa
no_conteiner 'echo x > /tmp/y && mc cp /tmp/y source/plugga-faturas/outro/solto.txt >/dev/null'
roda; esperado "objeto sem destino" 3 "$CODIGO"
grep -q "sem destino no mapa: plugga-faturas/outro/solto.txt" /tmp/migra-saida.txt || { echo "✗ a saída não aponta o objeto solto" >&2; exit 1; }
mc rm source/plugga-faturas/outro/solto.txt >/dev/null

# --- 4. origem vazia
for b in plugga-faturas plugga-corpus-faturas plugga-backups; do mc rm --recursive --force "source/$b" >/dev/null; done
roda; esperado "origem vazia" 2 "$CODIGO"

# credencial nunca aparece na saída
if grep -q "ensaio-secret" /tmp/migra-saida.txt; then echo "✗ credencial vazou na saída" >&2; exit 1; fi
echo "✓ nenhuma credencial na saída"

echo
echo "TODOS OS CASOS PASSARAM"
