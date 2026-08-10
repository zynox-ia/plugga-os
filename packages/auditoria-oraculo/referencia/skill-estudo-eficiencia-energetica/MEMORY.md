# MEMORY — Memória institucional do projeto de auditoria energética

*Linha do tempo de decisões e lições. Quem for operar (Junior, agente dedicado,
time) lê isto para não repetir erro que já custou caro.*

## Linha do tempo

- **04/08/2026** — Junior cria a metodologia universal de análise de fatura;
  Dilkson decide: o agente dedicado só nasce quando a skill estiver pronta.
- **05/08/2026 — o dia das 23 correções.** Junior tenta reproduzir o modelo de
  relatório "de olho": título trocado, CSS reinventado, fundo azul, seções
  cortadas. Lição central do projeto: **LLM copiando template sempre deriva**.
  Nasce o gerador determinístico (`gerar_relatorio_do_modelo.py`) com travas
  que recusam a saída imperfeita.
- **07-08/08/2026** — Dilkson entrega as duas planilhas (BESS_Dimensionador_Solar
  e REV04). Motor portado e **validado ao centavo** (VPL 4.187.197,95; TIR 33,74%).
  Duas decisões dele mudam o motor:
  - **Solar só carrega o BESS** que descarrega na ponta — excedente NÃO abate
    consumo FP (nem com 60% de simultaneidade) e não gera crédito.
  - **O&M BESS = CAPEX_total × 1% sem ×N** (célula C25 corrigida por ele).
- **08/08/2026 — os dois estudos-prova:**
  - **AM Química (ML, Manaus)**: fatura real 6 ciclos. INVIÁVEL — energia flat
    R$ 226/MWh faz o prêmio de ponta ser só o fio (0,74); spread 2,1×; VPL −283k.
    Lição: **cliente ML com fio barato não é cliente de BESS**; reativo pequeno
    se resolve com capacitores, não com BESS.
  - **Santa Tereza (Mercantil Nova Era, cativo Roraima)**: tarifas idênticas às
    da planilha (2,689175/0,625962 — este é o perfil-alvo). VIÁVEL: 4 BESS +
    193 kWp, VPL 3,08M, TIR 24,65%, payback 4,6 anos.
  - Descoberta na conciliação: "Adicional Bandeira Amarela" na fatura era
    **informativo** (bandeira Verde 0,00) e não entrava no total — pega pela
    prova soma-itens=total. Virou a TRAVA 1.
- **08/08/2026 — padrão fechado.** Dilkson aprova "100%" o relatório Santa
  Tereza em desktop E celular (camada v2: logo 20px + tagline no canto superior
  direito após print mostrando sobreposição). Commits `1098fb9`, `31dcc1b`.
- **08/08/2026 — governança completa**: travas 1-4 + semáforo + PRD + SOUL +
  DOCTOR + POLÍCIA. Decisão de Dilkson: o time todo vai operar via Telegram
  ("eu sozinho não dou conta de mandar tudo").

## Lições permanentes (custaram caro — não reaprender)

1. A soma dos itens TEM que bater com o total da fatura ao centavo, SEMPRE,
   antes de qualquer estudo (foi assim que a bandeira fantasma apareceu).
2. Fatura de ML se lê diferente de cativa: energia é flat (DANFE da
   comercializadora), o fio é da distribuidora — o spread que sustenta BESS
   pode simplesmente não existir.
3. Tarifa "com impostos" é a do custo evitado do cliente (2,689175, não 2,151340).
4. Demanda: reduzir contrato só economiza a parcela não utilizada (sem ICMS);
   o registrado continua faturado. Não prometer economia dupla.
5. `.gitignore` linha 62 ignora `templates/` — modelo congelado precisa de
   `git add -f`.
6. Sessão velha do agente carrega lista velha de skills — sempre sessão nova
   após mexer em skill/config.
7. Ano 1 do relatório = fluxo REAL com SOH (382.442,67), não a base sem SOH
   (387.890,81) — o número mais honesto é o menor.
8. Heredoc bash→python com aspas quebra fácil — scripts complexos vão por
   arquivo + scp, não inline.

## Referências cruzadas

- `PRD.md` — o sistema completo e por quê.
- `SOUL.md` — princípios; `POLICIA.md` — proibições; `DOCTOR.md` — diagnóstico.
- `SKILL.md` — fluxo operacional passo a passo (o que o Junior executa).
- `casos/INDEX.md` — todos os casos; Santa Tereza é o caso de referência.

## Conhecimento Dilkson — Mercado Livre (08/08/2026)
- **Preço da energia ACL**: NUNCA usar o preço unitário da linha da NF. Fórmula correta: **valor TOTAL da nota (com impostos) / volume MWh / 1000 = R$/kWh**. Somar com a TUSD com impostos do fio (ponta e fora ponta) = custo efetivo por kWh. O relatório deve indicar: "valor do kWh considerando custos efetivos de TUSD + TE ACL".
- **APCEI** (Aproveitamento de Crédito de Energia Incentivada): abatimento regulamentado na TUSD pela compra de energia incentivada. CORREÇÃO DILKSON (08/08, conta validada por ele): o crédito APCEI é função da energia incentivada COMPRADA, não do consumo na ponta — deslocar consumo com BESS NÃO reduz o crédito. Logo **o estudo usa a TUSD CHEIA da fatura** (ex. Imigrantes: 3,463060) + energia; o APCEI fica fora, junto com débitos/lançamentos. (Minha 1ª leitura — usar efetiva — estava ERRADA.)
- **Preço da energia com mais de uma NF**: usar a NF de FORNECIMENTO principal (contrato, maior volume): total com impostos / volume MWh / 1000. Ex. Imigrantes: 45.187,88 / 184,942 = 0,2443354 R$/kWh. Custo ponta = 3,463060 + 0,2443354 = 3,70739541 (validado por Dilkson).
- **Débitos, cobranças, juros e lançamentos de outras competências**: FORA do estudo — não fazem diferença para a solução.
- Encargos CCEE não passam pelo fio; demanda única FP no RO verde (fora do alcance do BESS em modalidade verde).
