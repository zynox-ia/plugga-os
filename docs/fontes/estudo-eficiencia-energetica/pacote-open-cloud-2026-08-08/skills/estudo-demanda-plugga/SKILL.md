---
name: estudo-demanda-plugga
description: >
  Gera o Estudo de Demanda Plugga no MODELO SAGRADO V16 (congelado) — o entregável de
  engenharia comercial mais recorrente da Plugga. Analisa o histórico de demanda registrada
  de uma UC contra a demanda contratada, identifica superdimensionamento (demanda ociosa) ou
  necessidade de ampliação, aplica a tolerância regulatória de 5% sobre ultrapassagem, monta
  três cenários (conservador, intermediário, arrojado) e produz um documento visual em HTML e
  PDF com papel timbrado Plugga, retrato A4, gráfico de histórico, tabela mês a mês, conclusão
  ao cliente, assinaturas e CTA. USE ESTA SKILL SEMPRE que o pedido envolver: "estudo de
  demanda", "modelo sagrado" (de demanda), "demanda contratada vs ultrapassagem", "demanda
  ociosa", "ampliação/redução de demanda", "kW contratado", ou quando o usuário enviar uma UC
  + histórico de demanda registrada/faturável pedindo análise de demanda — mesmo que não diga
  a palavra "estudo". É o serviço (1) Estudo de Demanda do menu de triagem do tópico OPERAÇÃO
  MES A MES.
---

# Estudo de Demanda — Plugga (Modelo Sagrado V16)

Esta skill produz o **Estudo de Demanda** padrão da Plugga: o documento que mostra ao cliente
se a demanda contratada da sua UC está superdimensionada (gerando demanda ociosa / dinheiro
deixado na mesa) ou subdimensionada (risco de ultrapassagem/multa), e recomenda o melhor valor
de demanda a contratar. O resultado final é um **HTML** (visual fiel, abre no navegador) e um
**PDF** retrato A4 com papel timbrado Plugga, pronto para validação interna e envio ao cliente.

## REGRA SAGRADA — modelo congelado

O modelo **V16 da CAA/Instituição Adventista** foi aprovado por Dilkson (validado por Leciane)
em 2026-05-18 como **padrão definitivo e congelado**. **NÃO altere** estrutura, visual, fontes,
timbrado, ordem das seções, lógica de cenários, gráfico, tabela, conclusão, assinatura, CTA ou
dados institucionais sem autorização explícita de Dilkson. Você muda **só os dados do caso**
(cliente, UC, período, demandas, tarifa, cálculos).

Fontes congeladas (não recriar do zero — partir delas):
- HTML de referência canônica: `reports/demanda-caa-2164280-2026-05-18/estudo_demanda_caa_padrao_plugga_v16_final.html`
- PDF de referência canônica: `reports/demanda-caa-2164280-2026-05-18/estudo_demanda_caa_padrao_plugga_v16_final.pdf`
- Template aprovado/congelado: `templates/plugga/estudo-demanda/modelo-aprovado-estudo-demanda-plugga-v1.html` (+ `.pdf`)
- Template limpo desta skill (placeholders): `assets/template-estudo-demanda.html`

A estrutura visual completa e as seções obrigatórias estão documentadas em
`references/padrao-v16.md`. **Leia esse arquivo antes de montar.**

## Quando usar

É o serviço **(1) Estudo de Demanda** do menu de triagem do tópico
`PLUGGA AI / OPERAÇAO MES A MES GESTAO`. Use sempre que o cliente/equipe enviar uma UC com
histórico de demanda registrada e quiser saber qual demanda contratar, ou pedir análise de
demanda contratada × ultrapassagem × ociosidade.

## Inputs necessários (peça se faltar — não invente)

1. **Cliente** (razão social / nome) e **CNPJ/CPF** quando houver.
2. **UC** (unidade consumidora).
3. **Demanda contratada atual** (kW) — na Verde é global; na Azul há ponta e fora-ponta.
4. **Modalidade tarifária / subgrupo** (ex.: A4 Horossazonal Verde ou Azul).
5. **Histórico de demanda registrada/faturável mês a mês** (kW por mês) na maior janela
   disponível — idealmente 12 a 16 meses. Identificar a referência (mês/ano) de cada ponto.
6. **Tarifa de demanda** (R$/kW) para valorizar economia/ociosidade.
7. **Período/janela analisada** (mês inicial → mês final).
8. **Objetivo**: redução (superdimensionada) ou ampliação (subdimensionada). Se não for dito,
   inferir pelo histórico e confirmar.

Se o histórico vier em fatura/PDF/imagem, extraia a demanda medida/faturável de cada mês. Se
vier pronto, valide a consistência (não misturar demanda de ponta e fora-ponta quando a
modalidade for Verde — nela a demanda é global).

## Regras de cálculo e enquadramento (invioláveis)

- **Tolerância de 5%** vale **somente para cima** (ultrapassagem): acima da demanda contratada
  até `contratada × 1,05` **não há multa**. Acima desse limite, há penalidade por ultrapassagem.
- **Para baixo não há multa.** Demanda usada abaixo da contratada = **demanda ociosa** = dinheiro
  deixado na mesa. Apresentar como ociosidade, **nunca como multa**.
- **Enquadramento (regra 2026-05-26):** estudo de demanda simples deve ficar em até **20%** de
  alteração (ampliação ou redução) sobre a contratada atual; o gatilho mínimo é **5%**. Se a
  alteração necessária for **< 5%** ou **> 20%**, não tratar como solicitação simples — encaminhar
  como **orçamento de conexão** (adequação de subestação/conexão), citando REN ANEEL 1.000/2021
  (Art. 154 ampliação, Art. 155 redução/limite de 1 redução em 12 meses, Arts. 311–314 testes).
- **Três cenários obrigatórios:** conservador (mais folga/menor risco), intermediário (equilíbrio),
  arrojado (maximiza economia com risco controlado). Para cada um: demanda proposta, limite sem
  multa (`×1,05`), meses acima do contrato, meses com multa, economia/mês, economia/ano, risco.
- **Economia mensal** ≈ `(demanda contratada atual − demanda proposta) × tarifa de demanda`,
  validada contra o histórico (a proposta não pode gerar multa na janela). **Economia anual** =
  economia mensal × 12 (projeção simples).
- **Recomendação** = cenário cujo limite sem multa (`×1,05`) fica **igual ou acima do pico
  observado** na janela, maximizando economia. Se o pico for instável/sazonal, recomendar o
  intermediário e registrar a ressalva.

## Fluxo de montagem (siga nesta ordem)

1. **Leia `references/padrao-v16.md`** para fixar seções e layout do modelo sagrado.
2. **Reúna e valide os inputs** acima. Faltou algo essencial (histórico, contratada, tarifa,
   modalidade)? Pergunte antes de montar.
3. **Classifique o enquadramento** (redução / ampliação / fora de faixa 5%–20% → orçamento de
   conexão). Defina objetivo.
4. **Calcule** pico observado, limite sem multa por cenário, meses acima/com multa, economia
   mês/ano e ociosidade média remanescente. Faça as contas explicitamente, não de cabeça.
5. **Parta do template** `assets/template-estudo-demanda.html` (ou copie o HTML congelado V16) e
   **substitua apenas os dados do caso**: cabeçalho/cliente/UC/janela, pills, 4 KPIs, card de
   decisão, resumo executivo, tabela de cenários, gráfico SVG (pontos do histórico + linhas de
   contrato proposto e limite sem multa), leitura técnica, demanda ociosa, condições para
   protocolar, tabela base mês a mês, conclusão, assinaturas, CTA e dados legais.
   - **Gráfico:** recalcule a escala vertical útil para evidenciar a variação real (não começar
     em zero), plote cada mês como ponto rotulado, e desenhe as linhas tracejadas laranja
     (contrato proposto) e verde (limite sem multa). Eixos X (mês de referência) e Y
     (demanda kW) sempre identificados.
6. **Renderize o PDF retrato A4** com Playwright/Chromium:
   ```bash
   node /root/.openclaw/workspace/tools/html-render/html-to-pdf-a4.js \
     reports/demanda-<cliente>-<uc>-<data>/estudo_demanda_<cliente>.html \
     reports/demanda-<cliente>-<uc>-<data>/estudo_demanda_<cliente>.pdf
   ```
   Use o helper de retrato A4 (`html-to-pdf-a4.js` / `html-to-pdf-portrait.js`); **não** usar
   LibreOffice (destrói o layout). As fontes Anybody/Anek já estão embutidas via `@font-face`
   apontando para `assets/fonts/`.
7. **Revise o PDF contra o V16 congelado** (timbrado, hero, KPIs, gráfico, tabela, conclusão,
   assinaturas, CTA, dados legais). Só entregue após essa conferência.

## Onde salvar o output

Crie uma pasta por caso:

```
reports/demanda-<cliente-slug>-<uc>-<AAAA-MM-DD>/
  estudo_demanda_<cliente>.html
  estudo_demanda_<cliente>.pdf
  dados_demanda.csv        # histórico mês a mês usado (opcional, recomendado)
```

Exemplos reais de referência: `reports/demanda-caa-2164280-2026-05-18/`,
`reports/demanda-marcio-koji-uc-0088337-2026-06-03/`,
`reports/demanda-oncoclin-coroado-2138923-2026-05-21/`.

## Regras de layout (modelo sagrado)

- **Papel timbrado oficial Plugga** em todas as páginas, retrato A4 (`@page size:A4 portrait`).
- **Fontes do brandbook:** Anybody (títulos/valores) e Anek Devanagari (corpo).
- **Paleta Plugga:** petróleo `#003333`, areia `#E0DBC7`, folha/verde `#00AF88`, laranja `#F25601`,
  bege `#D6B896`, papel `#fbfaf4`.
- **Demanda ociosa / prejuízo explicado:** sempre mostrar o "dinheiro deixado na mesa" em R$/mês,
  mas sem empurrar contratação abaixo do limite seguro sem checar carga futura.
- **Conclusão ao cliente:** recomendar revisão **semestral** dos contratos de demanda, ou
  **trimestral** em casos de carga instável/sazonalidade/expansão.
- **Assinaturas:** Plugga (responsável pela análise) + Cliente (ciente/responsável pela UC).
- **CTA + dados legais** no rodapé: site, telefone, CNPJ e endereço Plugga.
- **NÃO** incluir rito interno, governança do modelo, termos como "v16/rascunho/teste/debug" no
  PDF do cliente.

## Dados institucionais Plugga (fechamento)

```
Plugga Consultoria e Gestão de Energia LTDA
CNPJ: 64.039.848/0001-07
Av. Rio Jutaí, 90 — Nossa Senhora das Graças — Manaus/AM — CEP 69.053-020
www.plugga.app.br | (92) 98401-7111 | contato@plugga.app.br
Frases oficiais: "Você no controle da própria energia." / "Energia não é só fatura. É controle."
```

## Integração com o pipeline OPERAÇÃO MES A MES

Quando o estudo nascer no tópico OPERAÇÃO MES A MES e for preciso anexar ao card e mover
estágio no Bitrix24, use a skill `bitrix-operacao-mes-a-mes`. Não enviar ao cliente sem
autorização explícita de Dilkson/equipe responsável.

## Arquivos desta skill

- `SKILL.md` — este guia.
- `references/padrao-v16.md` — estrutura visual e seções obrigatórias do modelo sagrado.
- `assets/template-estudo-demanda.html` — template HTML com placeholders (sem dados de cliente).
