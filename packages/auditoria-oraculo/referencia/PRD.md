# PRD — Sistema de Produção de Relatórios de Auditoria Energética Plugga

**Versão 1.0 · 08/08/2026 · Área: backoffice-suporte · Aprovador: Dilkson Gomes (COO)**
Skill: `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/`

---

## 1. Problema

A produção manual/improvisada de relatórios de auditoria energética falhou de forma
repetida e cara: em uma única manhã (05/08/2026) foram necessárias **23 correções**
de Dilkson em relatórios gerados pelo agente (título trocado, CSS reinventado, fundo
azul ilegível, seções cortadas, números inventados). O gargalo é duplo:

1. **LLM copiando modelo "de olho" sempre deriva** — não existe disciplina de prompt
   que garanta reprodução byte a byte de um layout aprovado.
2. **A extração da fatura é o único elo manual** — um número digitado errado produz
   um estudo lindo e errado, e ninguém percebe até o cliente contestar.

Além disso, Dilkson não pode ser o único operador: o time (via Telegram, com o
Junior/@pluggawazebot e o futuro agente `auditor-energia`) precisa produzir
relatórios sem depender dele e **sem poder errar**.

## 2. Objetivo

Produção de relatórios de auditoria energética (fatura cativa/ML + estudo BESS e
Solar+BESS) que seja:

- **Determinística** — mesmo caso ⇒ mesmo arquivo, byte a byte;
- **Aritmeticamente à prova de erro** — nenhum número sem fonte (fatura ou motor);
- **Operável por qualquer membro do time** via Telegram;
- **Fiscalizável em minutos** — Dilkson confere 4 números, não 20 páginas.

## 3. Não-objetivos (nesta versão)

- Apresentação comercial (adiada por decisão de Dilkson em 08/08).
- Memória de massa de 15 min e análise de 12 faturas (fase de proposta, não de
  pré-viabilidade).
- Precificação/cotação EPC.

## 4. Papéis

| Papel | Quem | Responsabilidade |
|---|---|---|
| Operador | Time via Telegram (Junior hoje; `auditor-energia` quando criado) | Recebe fatura, roda o pipeline, entrega conforme semáforo |
| Auditor técnico | Claude (sessão Dilkson) | Casos amarelos, tipos novos de fatura, manutenção da skill, DOCTOR |
| Dono/decisor | Dilkson | Premissas comerciais (CAPEX, TMA), aprovação de tipos novos (4 números), amostragem mensal |

## 5. Arquitetura — as duas fontes de verdade

```
FATURA (PDF) ──extração──▶ fatura.json ──TRAVA 1──▶ fatura_conciliada.json
                                                        │
                                             SEMÁFORO (verde/amarelo/vermelho)
                                                        │
premissas (PADRAO do motor) ──▶ caso.json ──▶ MOTOR (motor_bess_solar.py)
                                                        │ fluxo.json
modelo congelado (443 KB) ──▶ GERADOR (substituições literais + travas)
                                                        │ relatorio.html
                              PÓS-PROCESSADOR celular (camada @media)
                                                        │ relatorio_celular.html
                          TRAVA 2 (verificador aritmético do HTML final)
                                                        │
                  TRAVA 4 (registro de entrega) ──▶ ENVIO (sempre os 2 arquivos)
```

**Regra-mãe: número que não veio da fatura conciliada ou do motor NÃO EXISTE.**

## 6. Componentes (todos em `assets/`)

| Componente | Papel | Recusa quando |
|---|---|---|
| `conciliar_fatura.py` | **TRAVA 1** — prova: soma dos itens = total ao centavo; tarifa×qtde ≈ valor; campos obrigatórios | Qualquer divergência. Nunca "ajustar para fechar" |
| `motor_bess_solar.py` | Única calculadora (validada ao centavo contra as 2 planilhas de Dilkson) | — |
| `gerar_relatorio_do_modelo.py` | Clona modelo aprovado + substituições literais | Chave inexistente, CSS alterado, sobra do caso-fonte, seção removida |
| `gerar_versao_celular.py` | Camada `@media ≤640px` (v2) | CSS não é o do modelo; dupla aplicação |
| `render_pdf_claro.sh` | Único caminho de PDF (fundo claro forçado) | — |
| `verificar_relatorio.py` | **TRAVA 2** — refaz as contas do HTML final contra fatura+motor | Divergência > R$ 0,01 ou linha ausente |
| `triagem_semaforo.py` | Semáforo + registro de tipos conhecidos + faixas sanitárias | Vermelho: trava reprovada ou resultado "bom demais" |
| `teste_regressao.py` | **TRAVA 3** — golden test (Santa Tereza) | Saída difere da aprovada |
| `registrar_entrega.py` | **TRAVA 4** — log de produção com hash | Faixa vermelha |

## 7. Semáforo (política de autonomia)

- 🟢 **VERDE** — tipo de fatura conhecido (`casos/tipos-conhecidos.json`:
  distribuidora+regime+modalidade+grupo) e travas 1-2 OK → **produz e entrega
  sozinho**, registra a entrega. Dilkson não é acionado.
- 🟡 **AMARELO** — primeira fatura de uma combinação nova → produz, **não envia ao
  cliente**; manda a Dilkson **4 números**: total da fatura, consumo ponta, TIR,
  payback. OK dele → `--aprovar --por "Dilkson"` → tipo vira verde para sempre.
- 🔴 **VERMELHO** — trava reprovou, dado faltando, ou faixa sanitária violada
  (TIR > 60% a.a., payback < 24 meses, economia > 50% da fatura, spread > 8×) →
  **para e escala com o erro**. Nunca entrega, nunca "dá um jeitinho".

## 8. Regras de produto (aprovadas por Dilkson, invioláveis)

1. Modelo congelado: `templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html`.
   Relatório novo NUNCA é escrito à mão — só pelo gerador.
2. Correção entra no **caso.json** e regenera tudo. Editar HTML de saída é proibido.
3. Solar existe **só para carregar o BESS** que descarrega na ponta; excedente não
   abate consumo FP nem gera crédito (decisão 08/08/2026).
4. O&M BESS = CAPEX_total × 1% **sem** multiplicar por N (fórmula corrigida por Dilkson).
5. CAPEX de referência: R$ 550 mil por unidade BESS (LUNA2000-241).
6. Fluxo de caixa: 20 anos, SOH interpolado, reajuste 8% a.a., O&M 3% a.a.
   Indicadores NO RELATÓRIO: TIR, payback simples e acumulado 20 anos — SEM
   TMA/VPL/payback descontado (decisão Dilkson 08/08; VPL@12% segue interno
   no motor para semáforo e validação contra as planilhas).
7. Fundo claro sempre (PDF via `render_pdf_claro.sh`; celular com `color-scheme:
   light only`). Fundo escuro + texto escuro é falha grave.
8. Entrega = **dois arquivos sempre** (desktop + `_celular`).
9. Sem "executivo" solto, sem "sensibilidade alta", conclusão no lugar do modelo,
   sem fórmulas em documento de cliente.
10. Pré-viabilidade ≠ proposta: a seção 8 (12 faturas + memória de massa) nunca sai.

## 9. Fiscalização humana (enxuta de propósito)

- **Por relatório amarelo**: Dilkson confere 4 números (≈ 5 min).
- **Mensal**: amostragem — 1 relatório aleatório do `registro-producao.jsonl`
  conferido contra a fatura original (≈ 10 min). Passou = sistema sadio; falhou =
  problema sistêmico, parar produção e rodar DOCTOR.
- **Trimestral**: revisão de premissas (CAPEX, HSP, tarifas REH, TMA) — Claude
  prepara o diff, Dilkson decide.

## 10. Métricas de sucesso

- Zero correções de layout/formato após 08/08/2026 (era 23/manhã).
- Zero números contestados com sucesso por cliente.
- 100% das entregas registradas (auditável por hash).
- Tempo de Dilkson: ≤ 15 min/mês de fiscalização + 1 decisão de premissa/trimestre.

## 11. Roadmap

1. **Feito** — motor validado, gerador com travas, celular v2, travas 1-4, semáforo.
2. Criar agente dedicado `auditor-energia` (bootstrap pronto; falta Dilkson criar o
   grupo "AUDITORIA ENERGÉTICA — PLUGGA" no Telegram + aplicar config + restart).
3. Treinar o time: fatura → grupo/DM do agente → pipeline automático.
4. Apresentação comercial (modelo a definir com Dilkson).
5. Fase proposta: 12 faturas + memória de massa + cotação EPC.

## 12. Riscos residuais e mitigação

| Risco | Mitigação |
|---|---|
| Interpretação errada de fatura de formato novo | Semáforo amarelo obriga revisão na primeira de cada tipo |
| Premissa envelhecida (CAPEX, tarifa) | Revisão trimestral com dono definido (Dilkson) |
| Mudança na skill quebra o padrão silenciosamente | Golden test obrigatório pós-commit |
| Reenvio de versão velha | Hash no registro de produção |
| Agente com contexto truncado improvisa | Pipeline é executável (scripts recusam); improviso não passa das travas |
