# Padrão V16 — Estrutura visual e seções obrigatórias do Estudo de Demanda Plugga

Documento de referência do **modelo sagrado V16** (congelado em 2026-05-18, aprovado por
Dilkson, validado por Leciane). Baseado no HTML/PDF reais:
`reports/demanda-caa-2164280-2026-05-18/estudo_demanda_caa_padrao_plugga_v16_final.html`.

Trate este arquivo como o "mapa de paridade": o estudo só está completo quando contém TODAS as
seções abaixo, na mesma ordem, com o mesmo visual. Só os dados do caso mudam.

## Tokens visuais (CSS root)

```
--petroleo:#003333   (verde-escuro principal, hero, títulos, eixos)
--areia:#E0DBC7      (fundo da página e textos sobre hero)
--folha:#00AF88      (verde acento, valores "good", linha de limite sem multa)
--laranja:#F25601    (acento/alerta, linha de contrato proposto, valor "orange")
--bege:#D6B896       (grades do gráfico)
--vinho:#670001
--paper:#fbfaf4      (cards)
--text:#123333
--line:#e7dfcc       (bordas/linhas)
```

- **Tipografia:** `Anybody` (Bold/Regular) para títulos, eyebrow, KPIs, valores e cabeçalhos de
  tabela; `Anek Devanagari` para corpo. Embutidas via `@font-face` apontando para
  `/root/.openclaw/workspace/assets/fonts/anybody/` e `.../anek-devanagari/`.
- **Página:** retrato A4 (`@page{size:A4 portrait;margin:34mm 14mm 28mm 14mm}`), fundo branco na
  impressão. A margem superior grande (34mm) reserva o espaço do **papel timbrado**.
- **Cards/KPIs:** fundo `--paper`, borda `--line`, `border-radius` ~26px, sombra suave (removida
  no print). Hero com `border-radius:32px` e gradiente petróleo + brilho laranja no canto.

## Ordem obrigatória das seções

1. **HERO / cabeçalho timbrado**
   - Eyebrow: `Plugga Gestão de Energia • Estudo de Demanda Ideal`.
   - `<h1>` com manchete de valor (ex.: "Demanda certa: economia sem perder controle operacional").
   - Subtítulo: `Cliente: <nome>` • `UC <numero>` • `Janela analisada: <MM/AAAA a MM/AAAA>`.
   - Logo Plugga (SVG/base64) à direita + carimbo "Você no controle / da própria energia.".
   - **Pills** no rodapé do hero: subgrupo/modalidade, modalidade horossazonal, tipo de demanda
     (global), `Tolerância 5%`.

2. **KPIs (grid de 4 cards)** — em print viram 2×2:
   - Contrato atual (kW).
   - Pico observado (kW) — maior demanda usada na janela (valor laranja).
   - Escolha recomendada (kW) — valor verde "good".
   - Ganho estimado (R$/mês • R$/ano) — valor verde "good".

3. **Decisão recomendada + Resumo executivo (grid 2)**
   - Card escuro `.decision`: valor grande (kW recomendado) + texto explicando a escolha, a
     tolerância de 5%, o limite sem multa e que nenhum mês geraria multa na janela.
   - Card `Resumo executivo` com `.callout` (faixa verde): diagnóstico de superdimensionamento
     (ou subdimensionamento) + premissa da tolerância de 5% e penalidade por ultrapassagem.

4. **Análise de cenários (card + tabela)**
   - Tabela com colunas: Cenário | Demanda | Limite sem multa | Meses acima contrato | Meses com
     multa | Economia mês | Economia ano | Risco.
   - Linhas: **Conservador**, **Intermediário**, **Arrojado** (a recomendada recebe classe `best`
     com fundo verde-claro). Cada cenário tem subtítulo curto explicando o trade-off.
   - Nota de rodapé explicando "meses acima contrato" vs "meses com multa".

5. **Histórico de demanda usada (card + gráfico SVG)**
   - Legenda externa limpa: linha laranja = contrato proposto (kW); linha verde = limite sem
     multa (kW).
   - SVG: grade horizontal com escala vertical **útil** (não inicia em zero; usar faixa que
     evidencie a variação real), linhas tracejadas laranja (contrato) e verde (limite sem multa),
     polilinha do histórico, cada mês como ponto verde rotulado com o valor, rótulos de mês no
     eixo X rotacionados ~38°.
   - Eixo X identificado ("Eixo X — mês de referência da fatura") e eixo Y identificado
     ("Eixo Y — demanda medida/faturável (kW)").
   - Nota abaixo explicando a escala e que todos os pontos ficam abaixo do limite verde.

6. **Leitura técnica + Demanda ociosa remanescente (grid 2)**
   - Leitura técnica (lista): modalidade identificada; na Verde a demanda é global; tolerância de
     5% só para cima; para baixo é demanda ociosa (não multa); quantos meses ficam acima da
     contratada mas sem multa.
   - Demanda ociosa remanescente (`.callout`): ociosidade média remanescente em kW/mês e o
     equivalente em R$/mês na tarifa de referência, com a ressalva de não contratar abaixo do
     limite seguro sem checar carga futura/sazonalidade.

7. **Condição para protocolar (card, lista compacta)**
   - Confirmar ausência de expansão de carga/novos equipamentos; validar sazonalidade fora da
     janela; conferir regra comercial da distribuidora para alteração contratual; alternativa
     intermediária se houver incerteza.

8. **Base mês a mês (card `compact-table`)**
   - Tabela centralizada: Referência | Demanda usada | Parcela complementar | Contrato atual |
     Status com a demanda recomendada. Meses de pico recebem classe `warn`.

9. **Conclusão e orientação ao cliente (`closing-card`)**
   - Parágrafo recomendando o valor de demanda, condicionado à ausência de aumento de carga.
   - Parágrafo de boa prática: revisão **semestral** dos contratos; **trimestral** em unidades com
     consumo instável/sazonalidade forte/expansão.
   - **Assinaturas** (grid 2): caixa "Plugga — Responsável pela análise" e caixa "Cliente —
     Ciente / responsável pela unidade consumidora".

10. **CTA (`cta-card`, fundo petróleo)**
    - "Quer mais controle na sua energia?" + "Fale conosco" + site e telefone.

11. **Dados legais (`address-card`)**
    - Razão social, CNPJ, endereço completo Plugga.

12. **Footer** — "Plugga © <ano> • Estudo preliminar para validação interna" / "Energia não é só
    fatura. É controle." (oculto no print via `.footer{display:none}` no `@media print`).

## Regras de print (resumo do CSS)

- `@page A4 portrait`, margens reservando o timbrado (34mm topo).
- KPIs grid 4 → 2 colunas; grids 2/3 → 1 coluna no print.
- Tabelas com `font-size` reduzido e `table-layout:fixed` na base mês a mês (classe
  `compact-table`), células centralizadas.
- `break-inside:avoid` em cards, KPIs, hero, fechamento, assinaturas, CTA e address.
- `.footer{display:none}` no print.

## O que NUNCA aparece no PDF do cliente

- Sufixos de versão (v16, final, rascunho, teste, content), termos internos (debug, regra, rito,
  governança), nomes de arquivos ou notas de processo.
- Demanda abaixo do contrato rotulada como "multa" (é **ociosidade**).
- Gráfico com eixo Y começando em zero (perde a leitura da variação real).
