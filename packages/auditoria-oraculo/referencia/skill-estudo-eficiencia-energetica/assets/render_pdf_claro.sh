#!/bin/bash
# UNICO caminho autorizado para renderizar PDF desta skill (e de qualquer
# relatorio Plugga). Forca light no HTML e no Chromium — fundo azul impossivel.
# Uso: bash render_pdf_claro.sh entrada.html saida.pdf
set -e
IN="$1"; OUT="$2"
[ -f "$IN" ] || { echo "uso: render_pdf_claro.sh entrada.html saida.pdf"; exit 1; }
TMP=$(mktemp --suffix=.html)
if ! grep -q "color-scheme" "$IN"; then
  sed "s|<head>|<head><style>:root{color-scheme:light}html,body{background:#ffffff!important}</style>|" "$IN" > "$TMP"
else
  cp "$IN" "$TMP"
fi
cd /root/.openclaw/workspace/tools/html-render
node -e "
const {chromium}=require(\"playwright\");
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage();
await p.goto(\"file://$TMP\",{waitUntil:\"networkidle\"});
await p.emulateMedia({media:\"print\",colorScheme:\"light\"});
await p.pdf({path:\"$OUT\",format:\"A4\",printBackground:true,margin:{top:\"8mm\",right:\"8mm\",bottom:\"8mm\",left:\"8mm\"}});
await b.close();console.log(\"PDF ok: $OUT\");})();"
rm -f "$TMP"
