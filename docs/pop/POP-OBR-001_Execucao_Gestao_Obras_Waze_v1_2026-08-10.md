# PROCEDIMENTO OPERACIONAL PADRÃO
**WAZE ENERGIA**  
**CÓDIGO:** POP-OBR-001 | **VERSÃO:** 1.0  
**PROCESSO:** Execução e Gestão de Obras  
**ESCOPO:** Projeto → aprovação técnica → execução em campo → controle de material → segurança do trabalho  
**USO:** Base de requisito para permissões, bloqueios e trilha de auditoria no sistema Plugga/Waze OS  
**STATUS:** Rascunho operacional para validação da diretoria/engenharia  
**DATA:** 10/08/2026

---

## 1. DIRETRIZES GERAIS

Este POP define o fluxo mínimo para gestão de obras da Waze Energia, usando a entidade **Obra** já existente no sistema (`id`, `empresa`, `nome`, `cliente`, `ativa/inativa`).

A Obra é o eixo de vinculação entre projeto técnico, aprovação, execução em campo, evidências, segurança do trabalho, solicitações de material e controle de andamento.

### 1.1 Papéis reconhecidos

| Papel | Responsabilidade principal |
|---|---|
| `diretoria` | Aprovação final, desbloqueios críticos, reabertura excepcional de projeto aprovado e decisões fora de alçada. |
| `projetista` | Criação/edição de desenhos, memoriais, layout, documentação técnica preliminar e revisões antes da aprovação técnica. |
| `engenheiro` | Responsável técnico pela análise, aprovação técnica, liberação para campo e aceite técnico de medições/etapas. |
| `supervisor` | Coordenação da execução em campo, atualização de avanço físico, validação operacional de checklists e orientação dos técnicos. |
| `tecnico` | Registro de execução, fotos, status, checklist, apontamentos de campo e evidências. |
| `almoxarife` | Controle físico de materiais, recebimento, separação, entrega, devolução, consumo e saldo por obra. |
| `seguranca` | Gestão de EPI, APR, liberação de segurança, registro de incidentes e bloqueio de atividade insegura. |
| `gestor_suprimentos` | Validação de necessidade de compra e integração com o fluxo de Compras. |
| `comprador` | Cotação/aquisição conforme POP-COMP-001. |
| `financeiro` | Controle financeiro, pagamento, faturamento, centros de custo e cronograma financeiro, sem alterar medição técnica. |

### 1.2 Regras-mãe de bloqueio

Estas regras devem ser respeitadas em todas as etapas:

1. Técnico não edita orçamento.
2. Campo (`tecnico`/`supervisor`) não altera projeto/desenho já aprovado.
3. Almoxarife não altera cronograma financeiro.
4. Ninguém apaga evidência/foto/documento; qualquer correção vira nova versão ou registro de auditoria.
5. Financeiro não altera medição técnica.
6. Obra não compra direto sem passar pelo fluxo de Compras já definido no **POP-COMP-001**.
7. Projeto aprovado só pode ser reaberto por `engenheiro` com justificativa técnica ou por `diretoria`.

---

## 2. ESTADOS DO PROCESSO

| Ordem | Estado | Responsável pela transição | Descrição |
|---:|---|---|---|
| 1 | `obra_criada` | `diretoria`, `engenheiro` ou papel autorizado de cadastro | Obra cadastrada e vinculada a empresa/cliente. |
| 2 | `projeto_em_elaboracao` | `projetista` ou `engenheiro` | Projeto/desenho/memorial em construção. |
| 3 | `em_aprovacao_tecnica` | `projetista` ou `engenheiro` | Projeto enviado para validação técnica. |
| 4 | `projeto_aprovado` | `engenheiro` | Projeto congelado para execução. Campo não altera desenho/memorial. |
| 5 | `liberacao_campo_pendente` | `engenheiro`, `seguranca`, `supervisor` | Conferência de documentação, APR, EPI, equipe e materiais mínimos. |
| 6 | `liberada_para_execucao` | `engenheiro` + `seguranca` quando aplicável | Obra/etapa liberada para campo. |
| 7 | `em_execucao` | `supervisor` | Execução ativa em campo. Técnicos registram evidências. |
| 8 | `pendencia_campo` | `supervisor`, `engenheiro` ou `seguranca` | Execução bloqueada ou pendente por material, segurança, projeto ou cliente. |
| 9 | `medicao_tecnica` | `supervisor` ou `engenheiro` | Avanço físico submetido para conferência técnica. |
| 10 | `medicao_aprovada` | `engenheiro` | Medição técnica validada. Financeiro pode usar, mas não editar. |
| 11 | `obra_concluida_tecnicamente` | `engenheiro` | Execução técnica encerrada com evidências mínimas. |
| 12 | `obra_encerrada` | `diretoria` ou `engenheiro` autorizado | Encerramento final administrativo/técnico. |

---

## 3. FLUXO DETALHADO DO PROCESSO

### 1. CRIAÇÃO DA OBRA

**Responsável:** `diretoria`, `engenheiro` ou perfil autorizado.  
**Pode editar nesta etapa:** `diretoria`, `engenheiro`, `projetista` nos campos técnicos iniciais.  
**Não pode:** `tecnico`, `almoxarife`, `comprador` e `financeiro` criar obra sem autorização.

Campos mínimos:

- empresa;
- nome da obra;
- cliente;
- status ativa/inativa;
- responsável técnico preliminar;
- vínculo com proposta/contrato quando existir;
- local da obra — **em aberto se será obrigatório na primeira versão**;
- data prevista de início — **em aberto**;
- data prevista de conclusão — **em aberto**.

**Saída da etapa:** Obra criada e disponível para vincular projeto, materiais e registros de campo.

---

### 2. ELABORAÇÃO DO PROJETO

**Responsável principal:** `projetista`.  
**Apoio/aprovação parcial:** `engenheiro`.  
**Pode criar/editar:** `projetista`, `engenheiro`.  
**Somente leitura:** `supervisor`, `tecnico`, `almoxarife`, `financeiro`, `comprador`, salvo permissão específica.

Documentos possíveis:

- desenho/layout;
- memorial descritivo;
- diagrama unifilar;
- lista preliminar de materiais;
- escopo técnico;
- fotos ou levantamento inicial;
- ART/RRT quando aplicável — **em aberto quanto à obrigatoriedade por tipo de obra**.

**Bloqueio:** enquanto o projeto não estiver aprovado, a obra não deve avançar para execução em campo, salvo liberação excepcional registrada por `engenheiro` ou `diretoria`.

---

### 3. APROVAÇÃO TÉCNICA DO PROJETO

**Responsável pela transição:** `engenheiro`.  
**Pode aprovar:** `engenheiro`.  
**Pode solicitar revisão:** `engenheiro`, `diretoria`.  
**Não pode aprovar:** `projetista` sozinho, `supervisor`, `tecnico`, `almoxarife`, `financeiro`, `comprador`.

Critérios mínimos para aprovação:

- documentação técnica anexada;
- lista de materiais preliminar revisada;
- escopo técnico claro;
- pendências críticas registradas;
- riscos técnicos identificados;
- responsável técnico definido.

Ao entrar em `projeto_aprovado`:

1. desenhos/memoriais ficam congelados;
2. campo (`supervisor`/`tecnico`) não altera projeto;
3. alterações passam a exigir revisão formal;
4. versões anteriores permanecem em trilha de auditoria;
5. solicitações de material devem respeitar projeto aprovado e POP-COMP-001.

Para tirar do estado `projeto_aprovado`:

- `engenheiro` pode reabrir com justificativa técnica obrigatória;
- `diretoria` pode reabrir por decisão gerencial;
- todo retorno deve gerar nova versão do projeto, nunca sobrescrever silenciosamente.

---

### 4. LIBERAÇÃO PARA CAMPO

**Responsáveis:** `engenheiro`, `supervisor`, `seguranca`.  
**Pode liberar tecnicamente:** `engenheiro`.  
**Pode liberar segurança:** `seguranca`.  
**Pode iniciar execução:** `supervisor`, após liberação.

Checklist mínimo:

- projeto aprovado;
- equipe definida;
- supervisor responsável;
- técnicos vinculados;
- materiais mínimos disponíveis ou solicitação de compra aberta;
- APR obrigatória quando houver atividade de risco;
- EPI conferido quando aplicável;
- autorização do cliente/local — **em aberto se será campo obrigatório**.

**Bloqueio:** sem liberação técnica, a obra não deve entrar em `em_execucao`. Sem liberação de segurança quando exigida, a atividade de risco não pode iniciar.

---

### 5. EXECUÇÃO EM CAMPO

**Responsável principal:** `supervisor`.  
**Executores:** `tecnico`.  
**Pode registrar status/fotos/checklist:** `tecnico`, `supervisor`.  
**Pode validar status de campo:** `supervisor`, `engenheiro`.  
**Não pode:** campo alterar projeto aprovado ou orçamento.

Registros de campo permitidos:

- foto;
- vídeo — **em aberto se entra na primeira versão**;
- checklist de atividade;
- status de avanço;
- observação técnica;
- pendência;
- ocorrência;
- solicitação de material;
- apontamento de impedimento.

### 5.1 Evidência de campo

Considera-se evidência qualquer registro anexado à Obra ou etapa que comprove execução, condição, ocorrência, entrega, risco ou pendência.

Formatos aceitos:

- imagem (`jpg`, `jpeg`, `png`, `webp`);
- PDF;
- documento técnico;
- checklist preenchido;
- assinatura/aceite digital — **em aberto**;
- vídeo — **em aberto**.

Campos mínimos da evidência:

- obra vinculada;
- etapa vinculada;
- autor;
- data/hora de envio;
- tipo de evidência;
- descrição curta;
- status relacionado;
- geolocalização — **em aberto se será obrigatória**.

Regra de trava:

- evidência registrada não pode ser apagada;
- correção deve gerar nova evidência, comentário de correção ou versão revisada;
- ocultação só pode existir como marcação administrativa, mantendo trilha de auditoria;
- nem `admin` remove fisicamente evidência pelo sistema operacional padrão.

---

### 6. PENDÊNCIA DE CAMPO

**Pode abrir pendência:** `tecnico`, `supervisor`, `engenheiro`, `seguranca`, `almoxarife`.  
**Pode classificar prioridade:** `supervisor`, `engenheiro`.  
**Pode encerrar pendência técnica:** `supervisor` ou `engenheiro`.  
**Pode encerrar pendência de segurança:** `seguranca`.  
**Pode encerrar pendência de material:** `almoxarife` ou `gestor_suprimentos`, conforme origem.

Tipos mínimos:

- material insuficiente;
- divergência de projeto;
- condição insegura;
- acesso/local indisponível;
- cliente pendente;
- equipe indisponível;
- clima — **em aberto se será tipo próprio**;
- outro.

Pendência crítica pode bloquear avanço da etapa até tratativa formal.

---

### 7. CONTROLE DE MATERIAL NA OBRA

**Responsável:** `almoxarife`.  
**Pode solicitar material:** `supervisor`, `engenheiro`, `tecnico` com validação do supervisor.  
**Pode controlar estoque/entrega/devolução:** `almoxarife`.  
**Pode aprovar compra:** conforme POP-COMP-001, não por este POP.

O almoxarife controla:

- material recebido;
- material separado para obra;
- material entregue em campo;
- material consumido;
- material devolvido;
- sobra;
- perda/avaria;
- saldo físico por obra;
- comprovante de entrega/retirada;
- vínculo com solicitação de compra quando houver.

Fronteira com financeiro:

- almoxarife não altera orçamento;
- almoxarife não altera cronograma financeiro;
- almoxarife não aprova pagamento;
- almoxarife não altera valor de compra;
- financeiro usa registros de material como evidência de custo/entrega, mas não altera medição técnica.

Quando faltar material:

1. `tecnico` ou `supervisor` registra pendência de material;
2. `almoxarife` verifica saldo físico;
3. se houver estoque, registra separação/entrega;
4. se não houver estoque, encaminha solicitação para Compras;
5. aquisição segue obrigatoriamente o **POP-COMP-001**.

---

### 8. SEGURANÇA DO TRABALHO

**Responsável:** `seguranca`.  
**Apoio:** `supervisor`, `engenheiro`, `tecnico`.  
**Pode liberar segurança:** `seguranca`.  
**Pode bloquear atividade insegura:** `seguranca`, `supervisor`, `engenheiro`.  
**Pode registrar incidente:** qualquer membro vinculado à obra.

### 8.1 EPI

EPI deve ser registrado quando a atividade exigir equipamento de proteção.

Obrigatoriedade por tipo de atividade: **em aberto**.

Registro mínimo:

- colaborador/equipe;
- EPI exigido;
- EPI entregue/conferido;
- data/hora;
- responsável pela conferência;
- evidência quando aplicável.

Sem EPI obrigatório confirmado, atividade de risco não deve ser liberada.

### 8.2 APR — Análise Preliminar de Risco

APR é obrigatória quando houver atividade com risco elétrico, altura, movimentação de carga, ambiente energizado, obra civil associada ou outra atividade classificada como risco.

Lista final de atividades obrigatórias: **em aberto para validação do técnico de segurança/engenharia**.

Assinaturas mínimas:

- `seguranca`;
- `supervisor`;
- equipe executora ou responsável de equipe — **em aberto quanto ao formato digital**.

Sem APR obrigatória assinada, a etapa não deve avançar para execução.

### 8.3 Incidente

Incidente é qualquer evento de segurança, quase acidente, acidente, dano material, condição insegura ou desvio crítico.

Qualquer membro pode registrar incidente.

Campos mínimos:

- obra;
- data/hora;
- local;
- descrição;
- envolvidos;
- tipo;
- gravidade;
- evidências;
- ação imediata;
- responsável pela tratativa.

Incidente grave bloqueia a etapa até liberação de `seguranca` e/ou `engenheiro`.

### 8.4 Liberação de segurança

A liberação de segurança deve ocorrer antes de atividade de risco e pode ser revogada em caso de condição insegura.

Quem assina/libera:

- `seguranca`, quando houver requisito de segurança;
- `supervisor`, para ciência operacional;
- `engenheiro`, quando houver risco técnico/energização.

---

### 9. MEDIÇÃO TÉCNICA E AVANÇO FÍSICO

**Pode lançar medição/status:** `supervisor`, `engenheiro`.  
**Pode anexar evidência de execução:** `tecnico`, `supervisor`.  
**Pode aprovar medição técnica:** `engenheiro`.  
**Não pode aprovar medição técnica:** `financeiro`, `comprador`, `almoxarife`, `tecnico`.

A medição técnica deve conter:

- etapa executada;
- percentual físico ou marco concluído — **critério em aberto por tipo de obra**;
- evidências vinculadas;
- pendências remanescentes;
- responsável pela medição;
- aprovação do engenheiro.

Após `medicao_aprovada`:

- financeiro pode consultar para faturamento/pagamento;
- financeiro não altera medição técnica;
- qualquer ajuste técnico exige nova revisão técnica.

---

### 10. ENCERRAMENTO DA OBRA

**Pode solicitar encerramento:** `supervisor`, `engenheiro`.  
**Pode concluir tecnicamente:** `engenheiro`.  
**Pode encerrar administrativamente:** `diretoria` ou `engenheiro` autorizado.  
**Financeiro:** valida pendências financeiras sem alterar técnica.

Critérios mínimos para `obra_concluida_tecnicamente`:

- projeto aprovado vinculado;
- evidências finais anexadas;
- checklist final preenchido — **modelo em aberto**;
- pendências críticas encerradas ou justificadas;
- medição técnica aprovada;
- materiais devolvidos/baixados ou pendentes registrados;
- incidentes encerrados ou com plano de ação.

Critérios para `obra_encerrada`:

- conclusão técnica registrada;
- pendências financeiras/administrativas analisadas;
- documentos finais arquivados;
- status da Obra atualizado para encerrada/inativa quando aplicável.

---

## 4. SLA / PRAZOS ESPERADOS

| Etapa | SLA sugerido | Status da decisão |
|---|---:|---|
| Criação da obra após contrato/autorização | Em aberto | Não definido ainda. |
| Elaboração do projeto | Em aberto | Depende do porte/tipo da obra. |
| Aprovação técnica do projeto | Em aberto | Não definido ainda. |
| Liberação de campo após projeto aprovado | Em aberto | Depende de material, equipe e segurança. |
| Registro diário de campo | Até o fim do dia de execução | Sugestão operacional; confirmar. |
| Tratativa de pendência crítica | Em aberto | Não definido ainda. |
| Separação de material em estoque | Em aberto | Integrar com capacidade do almoxarifado. |
| Solicitação de compra externa | Segue POP-COMP-001 | Já definido fora deste POP. |
| Aprovação de medição técnica | Em aberto | Não definido ainda. |
| Encerramento técnico após execução | Em aberto | Não definido ainda. |

---

## 5. MATRIZ DE PERMISSÕES POR ETAPA

| Etapa/ação | diretoria | projetista | engenheiro | supervisor | tecnico | almoxarife | seguranca | gestor_suprimentos | comprador | financeiro |
|---|---|---|---|---|---|---|---|---|---|---|
| Criar Obra | A | N | A | N | N | N | N | N | N | N |
| Editar dados básicos da Obra | A | R | A | R | N | N | N | N | N | R |
| Criar/editar projeto antes de aprovação | R | A | A | C | N | N | N | N | N | N |
| Aprovar projeto técnico | C | N | A | N | N | N | N | N | N | N |
| Reabrir projeto aprovado | A | N | A com justificativa | N | N | N | N | N | N | N |
| Registrar foto/status/checklist | N | N | C | A | A | N | C | N | N | N |
| Validar avanço de campo | C | N | A | A | N | N | C | N | N | N |
| Registrar evidência | C | C | A | A | A | A | A | C | C | C |
| Apagar evidência | N | N | N | N | N | N | N | N | N | N |
| Registrar APR/EPI | N | N | C | C | C | N | A | N | N | N |
| Liberar segurança | N | N | C | C | N | N | A | N | N | N |
| Controlar material físico | N | N | C | C | C | A | N | C | C | N |
| Solicitar compra | C | N | A | A | R | C | N | A | C | N |
| Comprar/cotar | N | N | N | N | N | N | N | C | A | C |
| Aprovar medição técnica | C | N | A | C | N | N | N | N | N | N |
| Alterar cronograma financeiro | A | N | C | N | N | N | N | N | N | A |
| Encerrar tecnicamente | C | N | A | C | N | C | C | N | N | N |
| Encerrar administrativamente | A | N | R | N | N | N | N | N | N | C |

Legenda: **A** = autorizado/responsável; **C** = consulta/apoio; **R** = restrito/conforme campo; **N** = não autorizado.

---

## 6. FLUXOGRAMA — FLX-OBR-001

```text
[1. Obra criada]
        |
        v
[2. Projeto em elaboração]
        |
        v
[3. Enviar para aprovação técnica]
        |
        v
{Engenheiro aprovou?}
   | NÃO
   v
[Revisar projeto]
   |
   └──────────────> [2. Projeto em elaboração]

   | SIM
   v
[4. Projeto aprovado / congelado]
        |
        v
[5. Checar liberação de campo]
        |
        v
{APR/EPI/segurança obrigatórios?}
   | SIM
   v
[Segurança registra APR/EPI e libera]
        |
        v
{Segurança liberou?}
   | NÃO
   v
[Pendência de segurança]
        |
        └──────────────> [5. Checar liberação de campo]

   | SIM/NÃO APLICÁVEL
   v
[6. Liberada para execução]
        |
        v
[7. Execução em campo]
        |
        v
[Técnico/Supervisor registra foto + status + checklist]
        |
        v
{Falta material?}
   | SIM
   v
[Almoxarife verifica estoque]
        |
        v
{Tem estoque?}
   | SIM
   v
[Separar/entregar material]
        |
        └──────────────> [7. Execução em campo]

   | NÃO
   v
[Solicitar compra via POP-COMP-001]
        |
        └──────────────> [Pendência de material]

{Há pendência técnica/cliente/segurança?}
   | SIM
   v
[Pendência de campo]
        |
        └──────────────> [7. Execução em campo]

   | NÃO
   v
[8. Medição técnica]
        |
        v
{Engenheiro aprovou medição?}
   | NÃO
   v
[Corrigir medição / complementar evidência]
        |
        └──────────────> [8. Medição técnica]

   | SIM
   v
[9. Obra concluída tecnicamente]
        |
        v
[10. Encerramento administrativo]
        |
        v
[Fim]
```

---

## 7. PONTOS EM ABERTO PARA DECISÃO

1. SLA oficial de cada etapa.
2. Lista final de atividades que tornam APR obrigatória.
3. Obrigatoriedade de geolocalização em foto/evidência.
4. Modelo padrão de checklist diário e checklist final.
5. Formato de assinatura digital de APR/equipe.
6. Se vídeo será aceito como evidência na primeira versão.
7. Se autorização do cliente/local será campo obrigatório para liberação de campo.
8. Critério de medição por tipo de obra: percentual físico, marco, item checklist ou etapa.
9. Quem além de `engenheiro` pode criar Obra em produção.
10. Alçadas de diretoria para reabertura de projeto aprovado e encerramento administrativo.

---

## 8. NOTA DE INTEGRAÇÃO COM O SISTEMA

Este POP deve ancorar permissões e bloqueios no sistema. Regras não devem ser inferidas pelo desenvolvedor quando o POP marcar campo como **em aberto**.

A implementação deve preservar:

- trilha de auditoria imutável para evidências;
- versionamento de documentos técnicos;
- separação entre medição técnica e financeiro;
- separação entre controle físico de material e cronograma financeiro;
- compras sempre pelo POP-COMP-001;
- projeto aprovado como estado de congelamento técnico.

**Skill/base consultada:** `bitrix-os-campo-obras-servicos` + formato do `POP-COMP-001_Processo_Compras_Suprimentos_v2.1`.
