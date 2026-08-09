const MARCADOR = "plugga-mobile-prd-v1";

const CAMADA = `<meta name="color-scheme" content="light only"><style id="${MARCADOR}">
@media (max-width:640px){
  html{color-scheme:light only}body{background:#fff!important}
  .page{width:100%!important;max-width:none!important;margin:0!important;padding:12px!important}
  .hero{padding:22px 16px!important}.hero h1{font-size:24px!important;line-height:1.08!important;padding-right:0!important}
  .hero .client{font-size:11px!important}.brandmark{position:static!important;margin-top:12px!important;justify-content:flex-end!important}
  .brandmark .logo-img{max-width:120px!important;height:auto!important}
  .grid,.grid-2,.grid-3,.cards,.kpis{display:grid!important;grid-template-columns:1fr!important}
  table{min-width:620px} .table-wrap,.table-shell{overflow-x:auto!important;-webkit-overflow-scrolling:touch}
  svg{max-width:100%!important;height:auto!important}
}
</style>`;

/** Pós-processador determinístico: o desktop permanece byte a byte intacto. */
export function gerarVersaoCelular(htmlDesktop: string): string {
  if (htmlDesktop.includes(MARCADOR)) {
    throw new Error("camada celular já aplicada");
  }
  if (!htmlDesktop.includes("</head>")) {
    throw new Error("relatório sem </head>; não é saída do gerador oficial");
  }
  return htmlDesktop.replace("</head>", `${CAMADA}</head>`);
}
