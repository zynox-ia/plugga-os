---
name: estudo-eficiencia-energetica
description: Use quando Dilkson pedir Estudo de Eficiência Energética, auditoria energética completa de fatura Grupo A/cativa, relatório cliente com oportunidades sem investimento, demanda ideal, reativo, benefício fiscal, BESS, Solar+BESS, Mercado Livre, payback, VPL, TIR, fluxo de caixa ou HTML/PDF Plugga para dono/investidor entender.
repo: Plugga-AM/plugga-waze-brain
area: backoffice-suporte
owner: Dilkson Gomes / Plugga Gestão de Energia
purpose: Padronizar o relatório comercial-consultivo de eficiência energética da Plugga, unindo auditoria de fatura, estudo de demanda ideal e pré-viabilidade de oportunidades.
metric: 0 relatório de eficiência energética entregue fora do padrão aprovado; reduzir retrabalho de layout/cálculo a melhorias pontuais.
status: ATIVO
---


## TRAVA INQUEBRÁVEL — dupla consulta ESTUDO BESS Solar+BESS (2026-08-07, Dilkson)

Antes de enviar qualquer HTML/PDF acionado por **ESTUDO BESS**, é obrigatório cumprir a trava documentada em `references/prd-trava-dupla-consulta-estudo-bess.md`:

1. **Antes de gerar:** consultar o modelo padrão Jardim Floresta e o repositório da skill no workspace.
2. **Gerar sempre como Solar+BESS:** BESS sozinho é apenas subdimensionamento técnico da bateria.
3. **Depois de gerar e antes de enviar:** reconsultar novamente o modelo padrão e a skill/referências/scripts.
4. **Validar cálculo e gráficos:** especialmente fatura atual x cenários, economia anual projetada, fluxo de caixa acumulado e economia acumulada/tabela anual.
5. **Se a dupla consulta não fechar:** bloquear o envio. Não existe HTML “quase certo”.

Modelo padrão Jardim Floresta confirmado por Dilkson/anexo:
`reports/auditorias/jardim-floresta-uc-01374052-2026-06/auditoria_energetica_jardim_floresta_uc_01374052_2026_06_solar_bess_padrao.html`

SHA256 do modelo confirmado: `0640a0ab0fa848973cb4d89a682c0a54dbebe96f08d038ef9c58fc1f013224d4`.


## REGRA SAGRADA — modelo congelado (04-05/08/2026, Dilkson)

O relatório de eficiência energética SEMPRE parte do modelo aprovado:
`templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html`

**NÃO recriar layout, seções, gráficos ou textos-base do zero.** Trocar apenas os dados do caso
(cliente, UC, números da fatura, oportunidades). Estrutura de 8 seções fixas conforme
`skills/analise-fatura-cativa-plugga/references/padrao-relatorio-auditoria.md`: Resumo (sem
"executivo") → Identificação da UC → Demanda + Estudo Ideal → Consumo/custo/tarifa → Reativo/
bandeira/encargos/impostos/benefícios → Diagnósticos e recomendações → Oportunidades (BESS/
Solar+BESS/ML; CAPEX base R$ 550 mil/unidade LUNA2000-241; fluxo de caixa 20 anos; sem
"sensibilidade alta") → Dados para próximos passos. Gráficos verticais em plano cartesiano.
Rodapé: dados Plugga + CONFIDENCIAL + "PLUGGA — VOCÊ NO CONTROLE DA SUA ENERGIA."
Sem fórmulas no documento do cliente — fórmulas e regras vivem nesta skill.


# Estudo de Eficiência Energética — Plugga




## PROIBIDO REESCREVER O MODELO — USE O GERADOR (05/08/2026, definitivo)

Depois de TODAS as tentativas manuais falharem (titulo trocado, CSS reinventado,
fundo azul, secoes cortadas — 23 correcoes de Dilkson em uma manha), o relatorio
passa a ser gerado EXCLUSIVAMENTE por:

```
# 1. ver o que o caso novo precisa cobrir:
python3 assets/gerar_relatorio_do_modelo.py --listar-pendencias

# 2. montar caso.json com o mapa de -> para (texto EXATO do modelo -> dado novo)

# 3. gerar:
python3 assets/gerar_relatorio_do_modelo.py --dados caso.json --saida reports/<slug>.html
```

O script clona o modelo aprovado byte a byte e SE RECUSA a gravar se: sobrar
qualquer dado do caso-fonte, o CSS mudar, uma chave nao existir no modelo ou o
numero de secoes divergir. Nao ha saida "quase igual" — ou e clone com dados
novos, ou nao existe arquivo. E PROIBIDO escrever o HTML deste relatorio de
qualquer outra forma. Entrega padrao: HTML (PDF apenas se pedirem junto). **PDF SO por `bash assets/render_pdf_claro.sh in.html out.pdf`** — forca light no HTML e no Chromium; fundo azul (dark mode do render, bug documentado 16/07) fica impossivel. PROIBIDO renderizar por qualquer outro caminho ou iterar no CSS as cegas ("sem_fundo_azul", "BRANCO_TOTAL" = sintoma de caminho errado).
Seu trabalho e SO: extrair os dados da fatura e montar o caso.json.

### Pedidos novos de Dilkson = ADIÇÃO, nunca remoção (05/08/2026)

Quando Dilkson pedir conteúdo novo (ex.: projeção Solar+BESS, espelho comparativo
de fatura), ele entra como bloco ADICIONAL via `"insercoes"` do caso.json
(`apos_titulo` + `html` usando as classes CSS do próprio modelo). **As seções do
modelo validado — todas as 10, incluindo 7 (Oportunidades) e 8 (Próximos
passos) — permanecem SEMPRE.** O gerador recusa saída com seção removida ou
esvaziada. Erro que motivou a regra: versão Solar+BESS de 05/08 entregue sem os
itens 7 e 8.
## Canais de uso autorizados

Esta skill pode ser acionada e usada em:

- DM privado de Dilkson com o @pluggawazebot;
- grupo **Plugga AI - OPERAÇÃO MÊS A MÊS**.

Se surgir pedido em outro grupo, tratar como fora da rota padrão e confirmar antes de processar ou enviar relatório.

## Quando usar

Gatilho obrigatório: quando Dilkson/equipe escrever **ESTUDO BESS**, interpretar como **Estudo de Eficiência Energética Solar+BESS — modelo Jardim Floresta** e seguir as premissas em `references/metodologia-calculos.md`.

Use esta skill sempre que a demanda envolver:

- “estudo de eficiência energética”;
- auditoria energética completa de fatura;
- análise de fatura Grupo A/cativa com relatório para cliente;
- oportunidade de economia sem investimento;
- estudo de demanda ideal;
- reativo/fator de potência;
- benefício fiscal/isenção/subsídio;
- BESS, Solar+BESS, deslocamento ponta/fora ponta, peak shaving ou Mercado Livre;
- geração de HTML/PDF Plugga com visual executivo.

Se o pedido for só conferência item a item de fatura, use também `analise-fatura-cativa-plugga`.  
Se houver estudo de demanda ideal, colete a lógica da skill `estudo-demanda-plugga`.  
Se for comparar Mercado Livre × Cativo/OPM, use `relatorio-economia-plugga` como fonte visual e metodológica.

## Ordem obrigatória do relatório

1. **Cabeçalho Plugga** — arquitetura real do OPM (`relatorio-economia-plugga/assets/template.html`), com logo oficial; não recriar por memória.
2. **Resumo executivo da fatura** — valor, referência, vencimento, consumo, custo médio total e destaques.
3. **Identificação da unidade consumidora** — consumidor, UC, distribuidora, localidade, grupo/modalidade, período e referência.
4. **Análise de demanda** — contratada, registrada ponta/fora ponta, utilização, tolerância, ultrapassagem e **demanda ideal preliminar**.
5. **Consumo, custo médio efetivo e tarifa aplicada** — sem gráfico nesta seção; manter tabela e leitura.
6. **Composição da fatura, reativo e benefício fiscal** — gráficos pequenos lado a lado + tabela.
7. **Diagnóstico e recomendações da auditoria** — ações sem investimento e riscos.
8. **Oportunidades** — BESS, Solar+BESS, Mercado Livre e demais cenários; KPIs e pré-viabilidade.
9. **Análise Técnica Plugga** — card final verde, textual, com recomendação.
10. **Próximos passos** — checklist/timeline destacada para converter a análise em produto.
11. **Rodapé Plugga** — logo e frase/contato.

## Regras fundamentais

- **Fórmulas não aparecem para o cliente.** Fórmulas ficam em `references/metodologia-calculos.md`.
- **Dados financeiros nunca abreviam.** Usar `R$ 709.933,58`, não `R$ 710 mil`.
- **HTML precisa ser PDF-ready.** Não depender de rolagem horizontal para PDF.
- **Gráficos têm hierarquia.** Gráfico pequeno para composição/consumo; gráficos maiores só para economia anual e fluxo de caixa.
- **BESS é oportunidade no final**, não abertura do relatório.
- **Demanda ideal é obrigatória** quando houver dados suficientes; se não houver histórico/memória de massa, sair como preliminar e pedir dados.
- **Não copiar gráfico feio de Excel.** Usar o racional financeiro, mas visual Plugga.
- **Não usar termo “all-in” para cliente.** Usar “custo médio total da fatura”.
- **Custo médio de energia efetivo inclui demanda.**

## Referências obrigatórias

Leia conforme necessidade:

- `references/gatilhos-e-entradas.md` — quando acionar e quais dados pedir.
- `references/estrutura-relatorio.md` — seções, ordem e textos padrão.
- `references/metodologia-calculos.md` — memória interna de cálculo.
- `references/visual-pdf-ready.md` — layout, cabeçalho, gráficos, PDF e regra de não abreviar valores.
- `references/checklist-qualidade.md` — validação antes de enviar.
- `references/template-dados.json` — esquema de entrada para relatório.
- `references/piloto-serra-verde.md` — caso piloto aprovado como base inicial.
- `scripts/doctor.sh` — verificação estrutural da skill.
- `casos/INDEX.md` — banco de casos comparáveis.
- `references/fontes-externas.md` — fontes regulatórias/tarifárias a validar.
- `references/feedback-com-porque.md` — aprendizados e antierros do piloto.
- `AGENTS.md` — governança, permissões e canais.
- `MEMORY.md` — decisões estáveis e pendências da skill.
- `SOUL.md` — tom/persona do relatório.

## Fluxo operacional

1. Confirmar se há fatura completa e dados mínimos.
2. Extrair dados da fatura.
3. Rodar auditoria da fatura antes das oportunidades.
4. Rodar estudo de demanda ideal/preliminar.
5. Classificar oportunidades sem investimento.
6. Avaliar BESS por energia e potência usando LUNA2000-241-2S1, salvo outro equipamento informado.
7. Montar cenários: sem investimento, apenas BESS, Solar+BESS, Mercado Livre.
8. Gerar HTML com padrão visual Plugga e arquitetura real do OPM.
9. Validar PDF-ready, contraste, quebras e ausência de termos internos.
10. Entregar HTML; gerar PDF quando solicitado.

## Saída padrão

Nome de arquivo:

`reports/estudo-eficiencia-energetica-<cliente>-uc-<uc>-<ref>.html`

Se PDF:

`reports/estudo-eficiencia-energetica-<cliente>-uc-<uc>-<ref>.pdf`

## Gatilhos de qualidade antes de entregar

Antes de enviar, sempre verificar:

- Cabeçalho veio do template real OPM, não recriado.
- Logo Plugga oficial aparece.
- Não há fórmulas abertas para cliente.
- Não há valor financeiro abreviado.
- Gráficos cabem no HTML e no PDF.
- BESS usa 241 kWh / 108 kW por unidade, salvo exceção explícita.
- Horizonte financeiro padrão: 20 anos, salvo instrução diferente.
- Próximos passos aparecem em timeline/checklist destacado.
- Não há termos internos: `debug`, `teste`, `rascunho`, `corrigido`, `final`, `all-in`, “conforme Dilkson”.

## Canais autorizados

Esta skill pode ser usada nos seguintes canais:

- Privado de Dilkson com @pluggawazebot.
- Grupo **Plugga AI - OPERAÇÃO MÊS A MÊS**.
- Grupo **O&M PROJETOS** (`telegram:-5304455026`).

Em outros grupos, confirmar antes de processar/enviar relatório.

## Regra — gráfico de demanda ideal com histórico

Quando houver 12 faturas ou histórico de 12 meses, o item **Análise de demanda** deve incluir gráfico demonstrando a demanda ideal calculada: histórico mês a mês, demanda contratada atual, demanda ideal proposta e limite de tolerância sem ultrapassagem. Sem 12 meses/memória de massa, mostrar apenas prévia de demanda ideal com ressalva.


## MOTOR BESS + SOLAR — CALCULO SO PELO MOTOR (08/08/2026)

O estudo BESS/Solar+BESS e calculado EXCLUSIVAMENTE por
`assets/motor_bess_solar.py` — port validado ao centavo da planilha de Dilkson
(`references/BESS_Dimensionador_Solar_modelo_dilkson.xlsx`). O agente so monta
o `caso.json` (consumo de ponta a deslocar, tarifas da fatura/ML, kWp, HSP do
local, CAPEX negociado) e roda:

```
python3 assets/motor_bess_solar.py --caso caso.json --saida fluxo.json
```

Conceitos que o motor ja carrega (NAO recalcular de cabeca, NUNCA):
- utilizacao limitada ao consumo deslocado (fator J12) — o BESS nao fatura
  capacidade fisica cheia;
- solar cobre TODO o consumo fora-ponta e ainda carrega o BESS; cada kWh solar
  vale a tarifa FP evitada;
- fluxo MENSAL de 20 anos: SOH Huawei interpolado, reajuste energia 8% a.a.,
  O&M 3% a.a., degradacao solar 0,5% a.a.;
- indicadores: VPL na TMA 12%, TIR anual, payback em meses com fracao,
  acumulado e economia liquida de 20 anos;
- dias uteis = 21 e o padrao DESTE modelo (decisao de Dilkson na planilha) —
  substitui a "faixa 30/21" da referencia antiga para estudos BESS/Solar.
Premissas sao editaveis via caso.json; qualquer valor fora do padrao deve ser
declarado na secao de premissas do relatorio.


### Dois modos do motor (um por planilha-mãe de Dilkson)

- **BESS + Solar** (`references/BESS_Dimensionador_Solar_modelo_dilkson.xlsx`):
  `limitar_utilizacao_ao_consumo: true` — o BESS fatura só o consumo deslocado
  (fator J12).
- **BESS puro / REV04** (`references/BESS_Dimensionador_Modelo_REV04.xlsx`):
  `limitar_utilizacao_ao_consumo: false` (capacidade física cheia) e O&M
  informado direto via `om_bess_ano1` (na REV04: CAPEX × 1,5%).

Divergências entre as duas planilhas-mãe — **aguardam arbitragem de Dilkson**;
até lá cada modo segue fiel à sua planilha: (1) utilização limitada × cheia;
(2) O&M: N × CAPEX_total × 1% (Solar — provável dobro indevido) × CAPEX × 1,5%
direto (REV04); (3) SOH ano 12: 0,763 (Solar) × 0,766 (REV04).


## Versao celular do relatorio
Pedido de Dilkson 08/08/2026: HTML que funcione bem no celular sem quebrar.
- `assets/gerar_versao_celular.py --relatorio <relatorio_gerado>.html` gera `*_celular.html`.
- E um POS-PROCESSADOR: so aceita relatorio saido do gerador oficial (trava compara o CSS com o modelo congelado) e acrescenta UMA camada @media (max-width:640px) no head — grids viram 1 coluna, tabelas largas rolam na horizontal, hero compacta.
- O CSS do modelo NAO e tocado; desktop e PDF renderizam identicos. Meta color-scheme "light only" bloqueia o auto-dark do Chrome mobile (regra do contraste: fundo claro sempre).
- NUNCA editar o HTML celular a mao: qualquer correcao entra no caso.json, regenera-se o relatorio e roda-se o pos-processador de novo.


## PADRAO FECHADO — aprovacao Dilkson 08/08/2026
Dilkson aprovou 100% o relatorio Santa Tereza nas DUAS formas. Este e o padrao vigente:
- **Computador/PDF**: modelo congelado + gerar_relatorio_do_modelo.py (caso.json de substituicoes, geometria dos SVGs recalculada barra a barra) + render_pdf_claro.sh.
- **Celular**: assets/gerar_versao_celular.py (camada v2: brandmark 20px + tagline 6,5px no canto superior direito, eyebrow com espaco reservado, grids 1 coluna, tabelas com rolagem horizontal, color-scheme light only).
- Referencia completa de caso: casos/caso-relatorio-santa-tereza-2026-06.json (116 substituicoes).
- Entrega ao cliente/Dilkson: sempre os DOIS arquivos (desktop e _celular) — Telegram aceita sendDocument.
NAO alterar este fluxo sem aprovacao explicita de Dilkson.


## COMANDO UNICO DE PRODUCAO (obrigatorio desde 08/08/2026)
O agente NAO executa mais as etapas soltas. Trabalho do agente = preparar 2
arquivos de DADOS e rodar 1 comando:

  1. `fatura.json` — extracao literal da fatura (formato: conciliar_fatura.py)
  2. `caso_motor.json` — consumo ponta da fatura + tarifas da fatura + CAPEX
     550k x n_bess (referencia: casos/caso-motor-santa-tereza.json)
  3. `python3 assets/produzir_e_entregar.py --fatura fatura.json \
        --caso-motor caso_motor.json --chat <chat_id> --por "<agente>"`

O orquestrador roda TUDO (trava 1, motor BESS+Solar, semaforo, construtor
AUTOMATICO do caso de substituicoes, gerador, celular, trava 2, registro) e so
envia se cada etapa passar. VERMELHO aborta; AMARELO produz mas so envia com
--liberado-por-dilkson (imprime os 4 numeros p/ mandar a ele). O agente NUNCA
monta substituicao, NUNCA edita HTML, NUNCA envia relatorio por fora.
Casos fora do envelope v1 (ML, modalidade azul, ultrapassagem, item novo
>=1% do total) sao RECUSADOS pelo construtor com instrucao de escalar.

## FLUXO OPERACIONAL DETALHADO — referencia interna (o que o comando faz) (Telegram — Junior, agente auditor e time)
Qualquer pessoa do time manda a fatura (PDF/foto) no Telegram. O agente executa
NA ORDEM, sem pular etapa. Governanca completa: PRD.md, SOUL.md, POLICIA.md,
DOCTOR.md, MEMORY.md nesta pasta.

1. **Extrair** a fatura para `fatura.json` (formato no cabecalho de
   `assets/conciliar_fatura.py`). So o que esta escrito na fatura — nada de
   memoria/estimativa. Item que nao entra no total vai em `nao_cobrados`.
2. **TRAVA 1**: `python3 assets/conciliar_fatura.py --fatura fatura.json`.
   REPROVOU -> corrigir a EXTRACAO (nunca o total) e repetir. Nao passa, para.
3. **Montar caso do motor** (`caso.json`): consumo_ponta_desejado da fatura,
   tusd_p/tusd_fp = tarifas COM impostos (cativo) ou fio+PPA (ML), CAPEX
   550k/unidade, demais premissas herdam o PADRAO. Rodar:
   `python3 assets/motor_bess_solar.py --caso caso.json --saida fluxo.json`.
4. **SEMAFORO**: `python3 assets/triagem_semaforo.py --fatura
   fatura_conciliada.json --fluxo fluxo.json`.
   - VERMELHO (rc 2): PARA. Escalar a Dilkson com o erro literal.
   - AMARELO (rc 3): produz mas NAO envia ao cliente; manda a Dilkson os 4
     numeros (total, consumo ponta, TIR, payback); apos OK: `--aprovar --por
     "Dilkson"` e segue.
   - VERDE (rc 0): segue autonomo.
5. **Gerar o relatorio**: montar o caso de substituicoes (referencia completa:
   `casos/caso-relatorio-santa-tereza-2026-06.json`) e rodar
   `python3 assets/gerar_relatorio_do_modelo.py --dados caso_rel.json --saida rel.html`.
   Depois `python3 assets/gerar_versao_celular.py --relatorio rel.html`.
6. **TRAVA 2**: `python3 assets/verificar_relatorio.py --html rel.html
   --fatura fatura_conciliada.json --fluxo fluxo.json`. REPROVOU -> corrigir o
   caso e regenerar (NUNCA editar o HTML a mao).
7. **TRAVA 4 + entrega**: `python3 assets/registrar_entrega.py --arquivo
   rel.html --destino "..." --faixa verde --por "<agente>"` e enviar SEMPRE os
   dois arquivos (desktop + _celular). PDF so via `assets/render_pdf_claro.sh`.
8. **Registrar o caso** em `casos/` (md + json) e commitar na area
   backoffice-suporte.

Manutencao: apos QUALQUER commit na skill, rodar
`python3 assets/teste_regressao.py` (golden). Diagnostico completo: DOCTOR.md.
