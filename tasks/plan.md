# Correções e verificação de Pipelines

Plano de execução iniciado em 05/11/2026. O Linear continua sendo a fonte dos
critérios de aceite e das dependências; este arquivo registra a sequência de
trabalho, os limites e as verificações combinadas com André. Não é uma nova spec.

## Acordo de execução

- Trabalhar em incrementos na `develop`, preservando alterações preexistentes.
- Antes de cada execução, explicar na conversa o que muda e seu efeito na tela.
- André faz a conferência manual no localhost; entregar passos curtos e resultado
  esperado por incremento. Validação manual pendente não equivale a aprovação.
- Manter testes de regressão automatizados, lint, tipos, testes e build. Registrar
  separadamente testes aprovados, falhos e não executados.
- Usar somente infraestrutura local. Ensaios que criam dados usam a infraestrutura
  de teste isolada, sem apagar dados do localhost do André.
- Não mudar visual, modelos antigos de cliente/UC ou permissões comerciais sem
  requisito vigente. Não promover à produção.

## Sequência de execução

1. [PLU-303 — Persistir ordem do Kanban](https://linear.app/zynox-dev/issue/PLU-303).
   Ligar a posição calculada no arraste ao contrato existente; respeitar a resposta
   do servidor e restaurar a posição recusada. Não requer migration.
   Verificar topo/meio/fim, mesma etapa e outra etapa; preservar o tempo na etapa
   ao apenas reordenar. Manual: arrastar, recarregar e conferir; em falha, o card
   deve voltar à posição confirmada.
2. [PLU-302 — Feedback e estado da conversão](https://linear.app/zynox-dev/issue/PLU-302).
   Converter diretamente com os dados salvos, sem formulário ou confirmação
   preliminar, conforme ajuste solicitado por André em 05/11. Exigir nome e pelo
   menos telefone, e-mail ou CPF/CNPJ válido. Mostrar sucesso depois da resposta
   validada da API; possíveis duplicidades exigem escolha explícita. Edição de
   perfil permanece na ficha do lead, sem PATCH no fluxo da conversão.
   Conforme decisão posterior de André, converter também encerra a negociação
   como ganha na mesma transação e retira o card do Kanban, preservando histórico.
   A mesma regra vale para a conversão opcional ao transferir entre pipelines.
   Manual: clicar em Converter em cliente e conferir sucesso, vínculo e saída do
   Kanban após recarregar; verificar orientação quando faltarem dados e duplicidade.
3. [PLU-301 — Atualização do quadro](https://linear.app/zynox-dev/issue/PLU-301).
   Atualizar relógio e dados no retorno à aba sem sobrescrever operações pendentes
   ou aceitar respostas antigas. Verificar relógio controlado, falha de rede e
   duas sessões. Manual: alterar dados numa segunda sessão e voltar à primeira;
   conferir atualização sem perder busca ou rolagem.

As etapas 1 e 2 permitem edição paralela em arquivos distintos. A etapa 3 altera
a mesma coordenação de estado da etapa 1 e será implementada depois dela.

## Próximos incrementos após as três correções

- Listagem com mais de 2.000 leads: reproduzir a omissão, definir paginação e
  contadores completos no contrato compartilhado e vincular à issue correspondente
  antes de implementar. Não simplesmente retirar o limite da consulta.
- [PLU-275 — Documentos](https://linear.app/zynox-dev/issue/PLU-275) e propostas:
  revalidar upload, releitura, preview/download e PDF com RustFS de teste. Corrigir
  somente falhas reproduzidas; registrar separadamente a falta de execução na CI.
- [PLU-274 — Atividades](https://linear.app/zynox-dev/issue/PLU-274): tarefas hoje
  são locais à sessão. Persistência é uma implementação própria de API, banco e
  interface; não apresentar estado React ou localStorage como persistência do CRM.
- [PLU-277 — Calendário/navegação](https://linear.app/zynox-dev/issue/PLU-277) e
  [PLU-271 — Quadro/lista](https://linear.app/zynox-dev/issue/PLU-271): confirmar
  com André se calendário e filtros devem voltar; há trabalho preexistente na
  navegação que deve ser preservado.

Cada incremento posterior será detalhado com critérios da issue e arquivos
afetados antes de começar. Dúvidas de negócio não serão preenchidas por suposição.

## Evidências e conclusão

Para cada execução, registrar na conversa: mudança, testes executados e limites,
commit, passos manuais e resultado informado por André. A revisão final distingue
comprovado, parcialmente comprovado, falha identificada e não verificado.

Um fluxo só é liberado depois de demonstrar persistência, acesso correto e
tratamento de falhas pertinentes àquela funcionalidade. Testes pulados e status
do Linear não substituem prova da versão implementada.

## Preparação da promoção para main — 05/11/2026

André autorizou incluir todas as alterações concluídas e validadas no localhost.
A entrega será preparada em commits por assunto e em PR de `develop` para `main`.
O PR permanece em rascunho: André informou que a migração dos arquivos e das
credenciais de produção de SeaweedFS para RustFS ainda não está confirmada.
O procedimento e as provas necessárias constam em `ops/GUIA.md`.

Na revisão foram encontrados e encaminhados: configuração do balde na API,
cobertura do novo balde pelo backup externo, preenchimento dos perfis e contatos
selecionados dos negócios antigos, seletores E2E desatualizados e retorno de
foco em Clientes. Os ensaios usam somente os serviços isolados de teste.

Antes de liberar o PR, tratar também o escopo ainda incompleto já registrado
acima: Atividades continua em memória e não pode ser liberada como cadastro
persistente. PLU-301, paginação acima de 2.000 leads e calendário/filtros continuam
pendentes; esta preparação não representa conclusão dessas funcionalidades.

Verificação local desta preparação: lint e tipos aprovados; suíte padrão com
715 testes da API, 209 da web e 32 compartilhados aprovados. As integrações
opt-in foram conferidas separadamente: 50 casos de negócios/cadastro/backfill
e sete de documentos no Postgres/RustFS isolados, todos aprovados. A nova
migration também foi aplicada pelo comando oficial no banco isolado de teste.
Os cenários relevantes de Clientes, lista, arraste, conversão, documentos e
propostas passaram em navegador por grupos. Documentos teve um timeout na
compilação fria e passou na repetição isolada, sem retries nem alteração do
limite do teste. A suíte completa de navegador ainda depende da CI da release.
