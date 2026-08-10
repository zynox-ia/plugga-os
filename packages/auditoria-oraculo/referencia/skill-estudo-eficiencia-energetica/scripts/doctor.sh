#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
missing=0
for f in \
  SKILL.md README.md SOUL.md MEMORY.md AGENTS.md state.json \
  references/gatilhos-e-entradas.md references/estrutura-relatorio.md \
  references/metodologia-calculos.md references/visual-pdf-ready.md \
  references/checklist-qualidade.md references/template-dados.json \
  references/piloto-serra-verde.md references/feedback-com-porque.md \
  references/fontes-externas.md casos/INDEX.md templates/relatorio-html-pdf-ready.md
 do
  if [ ! -f "$BASE/$f" ]; then
    echo "MISSING $f"
    missing=1
  fi
done

# Optional: pass report paths as arguments to check client-facing output for forbidden terms.
# Example: scripts/doctor.sh reports/arquivo.html reports/arquivo.pdf.txt
if [ "$#" -gt 0 ]; then
  if grep -HInE 'all-in|debug|teste|rascunho|corrigido|conforme Dilkson' "$@"; then
    echo "FORBIDDEN_TERM_FOUND_IN_OUTPUT"
    missing=1
  fi
fi

exit "$missing"
