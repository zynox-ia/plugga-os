# Visual e PDF-ready

## Fonte visual

Para cabeçalho e identidade, usar a arquitetura real da skill:

- `skills/relatorio-economia-plugga/assets/template.html`
- `skills/relatorio-economia-plugga/assets/logo_clara.png`
- `skills/relatorio-economia-plugga/assets/logo_escura.png`

Não recriar cabeçalho por memória.

## Contraste

- Corpo sempre claro.
- Texto escuro em corpo/tabelas.
- Fundo verde escuro apenas em hero/card de análise técnica com texto branco.

## PDF-ready

- HTML precisa funcionar em PDF.
- Relatórios com gráficos: PDF preferencialmente A4 paisagem.
- Evitar rolagem horizontal como dependência.
- Controlar quebras: `break-inside: avoid` em cards, gráficos, tabelas e análise técnica.
- Gráficos grandes só para economia anual e fluxo de caixa.
- Gráficos pequenos para composição/participação.

## Gráficos

Item 4: sem gráfico.  
Item 5: dois gráficos pequenos lado a lado:

- composição cartesiana;
- pizza/participação.

Item 7: gráfico pequeno para fatura atual × cenário BESS.

Economia anual e fluxo de caixa:

- gráfico centralizado;
- eixo Y = valor;
- eixo X = tempo em anos;
- anos 1 a 20;
- tabela sintética embaixo;
- valores financeiros completos.

## Proibido

- Abreviar dinheiro (`R$ 8,3 mi`, `R$ 710 mil`).
- Expor fórmula no relatório cliente.
- Usar `all-in`.
- Usar termos internos.
- Copiar visual de planilha Excel.
