# POLÍCIA — Fiscalização e proibições da produção de relatórios

*O que o DOCTOR diagnostica, a POLÍCIA impede. Estas regras valem para
qualquer operador — humano, Junior, agente dedicado. Violação = relatório
recusado + escalar para Dilkson com o ocorrido (sem maquiar).*

## Proibições absolutas (sem exceção, sem "só desta vez")

1. **Escrever/editar HTML de relatório à mão.** Saída nasce do gerador; correção
   entra no caso.json e regenera. Foi exatamente o improviso manual que causou as
   23 correções de 05/08/2026.
2. **Ajustar um número "para fechar".** Se a soma não bate, o erro está na
   extração — a trava 1 existe para achá-lo, não para ser contornada.
3. **Entregar sem as travas.** Pipeline completo ou nada: conciliar → semáforo →
   motor → gerador → celular → verificar → registrar → enviar.
4. **Entregar em faixa vermelha.** Nunca. Nem "para o cliente ver uma prévia".
5. **Pular o registro de entrega.** Entrega sem registro = incidente.
6. **Fundo escuro / texto escuro.** PDF só via `render_pdf_claro.sh`; celular só
   via camada oficial.
7. **Inventar exemplo ou dado hipotético** em documento ou conversa com cliente.
   Só o que a fatura e o motor mostram.
8. **Alterar modelo congelado, premissas do motor ou faixas do semáforo** sem
   aprovação explícita de Dilkson registrada em commit.
9. **Enviar dado financeiro de cliente fora dos canais autorizados** (grupo do
   projeto, DM de Dilkson, FINANCEIRO). Grupo errado = vazamento.
10. **Regravar o golden test** sem citar no commit qual aprovação de Dilkson
    autorizou a mudança.

## Protocolo de amostragem mensal (fiscal: Dilkson ou quem ele delegar)

1. `python3 assets/registrar_entrega.py --listar` → escolher **1 entrega
   aleatória** do mês.
2. Abrir o HTML entregue (conferir o md5 contra o registro).
3. Contra a fatura original: **total, consumo ponta, tarifa ponta, demanda**.
4. Contra o motor (`--caso` correspondente): **TIR, payback, acumulado 20 anos**.
5. Veredito no próprio registro (`--obs "amostragem MM/AAAA: OK"` numa nova linha).
   - **OK** → sistema sadio até a próxima.
   - **Falhou** → parar produção, rodar DOCTOR completo, achar a causa raiz,
     corrigir o SISTEMA (não só o relatório), registrar a lição no MEMORY.md.

## Escalação

| Situação | Para quem | Prazo |
|---|---|---|
| Faixa vermelha | Dilkson (DM) com o erro literal das travas | imediato |
| Faixa amarela | Dilkson (DM) com os 4 números | antes de enviar ao cliente |
| Cliente contestou número | Dilkson + conferir hash no registro | imediato |
| Trava "atrapalhando" | Dilkson decide — trava não se desliga na mão | antes de prosseguir |

## Sanção operacional

Relatório produzido fora do fluxo é **inválido por definição** — mesmo que os
números estejam certos. Refazer pelo pipeline. A régua não é "deu certo?", é
"é reproduzível e auditável?".
