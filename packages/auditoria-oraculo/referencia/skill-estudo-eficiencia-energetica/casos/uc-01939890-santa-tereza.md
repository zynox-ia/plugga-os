# Mercantil Nova Era — loja Santa Tereza — UC 01939890
CNPJ 04.240.370/0043-06 · Rua São Sebastião 1449, Santa Tereza, Boa Vista-RR · Roraima Energia · Grupo A / A4 COMERCIAL · CATIVO · Horosazonal Verde · Alta tensão · Medidor YIT2100037

## Fonte
Fatura real 06/2026 (NF 21471964, venc 26/07/2026, total R$ 174.636,70, 30 dias).

## Dados do ciclo 06/2026
- Consumo Ponta: 17.419 kWh a 2,689175 (s/ imp. 2,151340) = R$ 46.842,73
- Consumo F/Ponta: 183.153 kWh a 0,625962 (s/ imp. 0,500770) = R$ 114.646,81
- Demanda: 133 kW a 22,16 (s/ ICMS) + 367 kW a 27,70 (c/ ICMS) = R$ 13.113,18 · contratada 500/500 · registrada 346 P / 367 FP
- Bandeira amarela: R$ 3.774,59 · COSIP R$ 33,98 · ICMS 20% (PIS/COFINS zero)
- Ufer P/FP = 0 -> SEM excedente reativo neste ciclo
- Média 12 meses: 216.276 kWh

**As tarifas desta fatura (2,689175 / 0,625962) são exatamente as da planilha BESS_Dimensionador_Solar — este é o perfil de cliente do modelo.** Spread ponta/FP: 4,3x.

## Estudo BESS+Solar (motor_bess_solar.py, solar-só-carrega-BESS, CAPEX R$550k/un, TMA 12%, HSP 5,0)
Ponta a deslocar: 17.419 kWh/mês -> **4 BESS** (cobertura 100%, utilização 92,8% da capacidade física).

| Cenário | CAPEX | VPL @12% | TIR | Payback | Economia líq. ano 1 |
|---|---|---|---|---|---|
| Só BESS (4 un) | 2.200.000 | **+1.980.421** | 22,1% | 5,1 anos | 387.891 |
| BESS + solar 193 kWp (R$ 482,5k) | 2.682.500 | **+3.080.623** | 24,7% | 4,6 anos | — |

Acumulado 20 anos (com solar): R$ 16.250.310.

**Parecer 08/08/2026: VIÁVEL — caso ideal do modelo (cativo, spread 4,3x, ponta alta e estável vs média 12m crescente). ** Contraste com [[uc-3531002-1-am-quimica]] (ML, spread 2,1x, inviável).

Caso do motor: `caso-santa-tereza-2026-06.json` · caso do relatório (substituições do modelo congelado): `caso-relatorio-santa-tereza-2026-06.json`.

## Relatório entregue 08/08/2026
`auditoria_energetica_santa_tereza_uc_01939890_2026_06.html` — gerado pelo gerador oficial (travas OK, CSS idêntico, 116 substituições, geometria dos 5 SVGs recalculada). Números do relatório usam o ano 1 REAL do fluxo (com SOH): economia ano 1 R$ 382.442,67 (média R$ 31.870,22/mês, redução 18,25% da fatura), payback descontado @12% = 7,8 anos. O ano1_base sem SOH (R$ 387.890,81) fica só como referência de dimensionamento.

## Status
Relatório (desktop + versão celular v2) **APROVADO por Dilkson em 08/08/2026 — "100% fechado"**. Vira o caso de referência do padrão.
