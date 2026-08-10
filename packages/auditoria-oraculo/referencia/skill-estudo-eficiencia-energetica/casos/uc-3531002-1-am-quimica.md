# AM Química Indústria e Comércio — UC 3531002-1 (ex 0087800-6)
CNPJ 07.842.762/0001-84 · Rua Rio Jaguarão 1, Vila Buriti, Manaus · Grupo A / A4 · LIVRE (Mercado Livre) · Horosazonal Verde · Alta tensão · Medidor 11908929

## Fonte
Fatura real 16 pág. (media/inbound FATURA_NF_AM_QUIMICA_PARA_ESTUDO_3eb86a32*.pdf): 6 ciclos fio Amazonas Energia (02–07/2026) + DANFEs Tietê Integra (energia ML).

## Energia (Tietê Integra — comercializadora ML)
- ENERGIA CONTRATADA: R$ 226,42/MWh (0,22642/kWh) — preço flat, vale ponta e fora ponta
- NF exemplo: nº 31.906, R$ 37.142,79, venc 20/07/2026

## Fio (Amazonas Energia) — 6 ciclos
| Ref | Consumo P (kWh) | tarifa P | Consumo FP (kWh) | tarifa FP | Dem. faturada | R$/kW | Reativo P/FP (kWh) | Total fio |
|---|---|---|---|---|---|---|---|---|
| 02/2026 | 1.066 | 0,683392 | 119.498 | 0,166660 | 634 | 11,485 | 302/1.100 | 35.238,01 |
| 03/2026 | 949 | 0,716346 | 127.629 | 0,166660 | 704 | 12,218 | 226/924 | 40.211,45 |
| 04/2026 | 1.192 | 0,685768 | 146.143 | 0,166660 | 705 | 11,538 | 277/1.016 | 42.505,30 |
| 05/2026 | 3.452 | 0,698165 | 142.136 | 0,166660 | 700 | 11,813 | 285/1.251 | 43.347,39 |
| 06/2026 | 10.113 | 0,709107 | 158.331 | 0,178818 | 700 | 11,778 | 201/1.545 | 53.060,77 |
| 07/2026 | 4.275 | 0,740105 | 126.050 | 0,229480 | 700 | 11,310 | 378/1.654 | 49.043,41 |

- Demanda contratada 700 kW (P e FP); desconto demanda ~46,8–50,0%
- Reativo excedente a 0,281110: R$ 320–570/mês (pequeno)
- Média 12m de consumo subindo: 110.305 → 127.917 kWh
- Consumo ponta MUITO variável: 949 → 10.113 kWh/mês (média 6 ciclos: 3.508)

## Estudo BESS+Solar (motor_bess_solar.py, regra solar-só-carrega-BESS, CAPEX R$550k/un, TMA 12%)
Tarifas do caso: hp = 0,740105 + 0,22642 = 0,966525 · hfp = 0,229480 + 0,22642 = 0,455900 (spread 2,1x)
- A) 1 BESS, ponta média 3.508, solar 43,2 kWp (R$108k): VPL −282.742 · TIR 5,7% · payback 13,3 a
- B) 1 BESS cheio (ponta 10.113 como normal), solar 43,2 kWp: VPL −160.134 · TIR 8,7% · payback 10,9 a
- C) idem B, solar 57,8 kWp: VPL −175.806 · TIR 8,5%
- Só BESS sem solar (cenário A): VPL −403.523 · TIR −0,8%

**Parecer 08/08/2026: INVIÁVEL na TMA 12% com CAPEX 550k/un.** Causa: no Mercado Livre a energia é flat (R$226/MWh) e o único prêmio de ponta é o fio (0,74) — spread ponta/FP de 2,1x, contra 4,3x do caso da planilha (tusd_p 2,689). Aguardando validação de Dilkson.

Caso do motor: `caso-am-quimica-2026-07.json` (HSP 4,5 Manaus, solar R$2.500/kWp).
