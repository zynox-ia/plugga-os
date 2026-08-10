# DOCTOR — Auto-diagnóstico da produção de relatórios

*Rotina de saúde da skill. Se qualquer item falhar, a produção PARA até
consertar. Rodar: (a) após qualquer commit que toque a skill; (b) no início de
um dia de produção; (c) sempre que a amostragem mensal reprovar.*

Diretório: `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/`

## Checklist (ordem obrigatória)

### 1. Golden test — o padrão aprovado está intacto?
```bash
python3 assets/teste_regressao.py
```
Esperado: `GOLDEN OK`. Se acusar regressão: alguém mudou gerador/modelo/camada
celular. **Reverter**, ou — se a mudança foi aprovada por Dilkson — `--regravar`
citando a aprovação no commit.

### 2. Motor — ainda bate com as planilhas de Dilkson?
```bash
python3 assets/motor_bess_solar.py --exemplo
```
Conferir contra os valores de validação (planilha Solar, modo legado):
VPL 4.187.197,95 · TIR 33,74% (REV04). Divergência = motor adulterado.

### 3. Travas respondem?
```bash
python3 assets/conciliar_fatura.py --fatura casos/fatura-santa-tereza-2026-06_conciliada.json
python3 assets/verificar_relatorio.py --html <ultimo relatorio> \
    --fatura casos/fatura-santa-tereza-2026-06_conciliada.json \
    --fluxo casos/fluxo-santa-tereza-bess.json
```
As duas devem APROVAR o caso de referência. Teste negativo rápido: mude um
centavo num JSON temporário e confirme que REPROVA (trava que não reprova
está morta).

### 4. Registro de tipos e de produção íntegros?
```bash
python3 assets/triagem_semaforo.py --fatura casos/fatura-santa-tereza-2026-06_conciliada.json
python3 assets/registrar_entrega.py --listar
```
Santa Tereza deve dar VERDE. O registro deve listar as entregas conhecidas.

### 5. Git — skill sincronizada?
```bash
git -C /root/.openclaw/workspace status -sb ; git -C /root/.openclaw/workspace log --oneline -3
```
Sem drift local não commitado na pasta da skill; `origin/main` em dia.

### 6. Descoberta pelo agente
A pasta da skill está nos `extraDirs` do openclaw.json e a sessão do agente é
NOVA (sessão velha carrega lista velha de skills — falha clássica do Junior).

## Sintomas conhecidos → causa provável

| Sintoma | Causa | Remédio |
|---|---|---|
| Relatório sai com dado de outro cliente | pulou o gerador (escreveu à mão) | POLÍCIA §1; regenerar via caso.json |
| Fundo azul/escuro no PDF | não usou `render_pdf_claro.sh` | único caminho de PDF |
| Logo sobrepondo título no celular | esqueceu `gerar_versao_celular.py` (camada v2) | pós-processar sempre |
| "Skill não encontrada" pelo Junior | sessão velha ou extraDirs ausente | nova sessão / conferir config |
| Números "bons demais" | extração errada (tarifa, regime ML×cativo) | trava 1 + semáforo vermelho |
| Golden falha após mexer no motor | motor muda números do relatório de referência | esperado: regravar SÓ com aprovação |
