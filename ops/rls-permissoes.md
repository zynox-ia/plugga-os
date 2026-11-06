# RLS de permissões (PLU-306)

A migration `20261106010000_isolamento_rls` habilita **ENABLE + FORCE RLS nos
72 modelos**. A conexão da aplicação nunca pode ser dona de objetos, herdar o
dono/migrador, ter SUPERUSER/BYPASSRLS, CREATE/DDL, TRUNCATE ou pertencer a outro
pool. O migrador precisa poder criar os grupos NOLOGIN e o schema de segurança.
Nenhum login ou senha é criado pela migration.

Provisione três logins distintos com credenciais fora do repositório e execute
`configurar-papeis-aplicacao.sql` com as variáveis psql `runtime_role`, `auth_role`
e `jobs_role`. O script valida nomes, atributos, ownership e privilégios antes
de conceder os grupos. Não altera serviços nem troca credenciais. Faça isso
somente no ambiente local sintético ou após aprovação explícita do André.

| Conexão | Grupo | Superfície |
| --- | --- | --- |
| `DATABASE_URL` | `plugga_runtime` | Negócio por sessão e políticas abaixo |
| `AUTH_DATABASE_URL` | `plugga_auth_runtime` | users, credentials, identities, sessions, auth_tokens, roles, ACL e agent_identities; event_log INSERT/SELECT para auditoria de autenticação |
| `JOBS_DATABASE_URL` | `plugga_jobs_runtime` | integrations, job_runs, bitrix_mirror_records; event_log INSERT/SELECT de eventos system |

O pool auth é uma capacidade privilegiada: só autenticação e gestão de acesso
devem recebê-lo. Não acessa negócio. O pool jobs também não acessa usuários,
credenciais ou negócio. Não use os pools privilegiados para contornar recusas
do pool de aplicação.

Em cada transação da aplicação, configure `plugga.session_hash` com `set_config`
e `is_local=true`, na **mesma conexão** das consultas. O helper
`plugga_security.usuario_id()` resolve o hash em sessions e exige usuário ativo,
expiração deslizante e absoluta válidas. O hash é uma capacidade secreta: nunca
retorne/logue hashes e nunca permita SELECT de sessions ao runtime. UUID, flag
de sistema e `app.user_id` forjados não autenticam. Todos os helpers usam
SECURITY DEFINER, search_path fixo, tabelas qualificadas e EXECUTE revogado de
PUBLIC. A policy SELECT exclusiva do migrador evita recursão dos helpers mesmo
com FORCE RLS e migrador sem bypass; nenhum runtime pode herdar esse papel.

Membros precisam da tela do recurso e só operam registros cujo owner é seu
usuário. Gerentes alcançam todos os registros das telas concedidas no mesmo
departamento. Não se combina nível de um departamento com tela de outro.
Admin alcança negócio e configuração; desenvolvedor inclui o acesso técnico.
Clientes podem ser lidos por CRM clientes/pipelines e pelas telas de energia;
oportunidades e contratos também têm leitura financeira por ownership/gestão.
Escrita usa a tela específica de CRM. A conversão de pipeline pode inserir um
cliente conforme ownership/gestão e seus contatos; alterar/excluir contatos
exige CRM Clientes. Famílias do negócio herdam o acesso ao pai. Unidades
consumidoras têm exceção somente SELECT pelo cliente acessível em Pipelines.
O gateway de fatura lê somente o modo da OpenRouter e o material cifrado da
chave através de funções restritas à tela de execução. Não recebe SELECT do
catálogo de integrações nem da tabela de segredos. A API de configuração
continua reservada à plataforma. Isso preserva a execução autorizada sem
ampliar o acesso às telas técnicas.
INSERT/UPDATE de negócio validam cliente visível por Pipelines, contato do
mesmo cliente, etapa e motivo do mesmo pipeline. Etiquetas, UCs e versões de
proposta também validam o vínculo ao pai.
Metadados de pipelines são legíveis pela tela; sua configuração exige gerente
CRM dessa tela. Membros só leem sua própria participação no pipeline. ACL e
usuários só têm SELECT no runtime; escrita usa auth.

Exceções explícitas: roles, companies e templates de proposta são catálogos
somente de leitura para qualquer sessão ativa. Empresa **não é tenant**.
Energia, obras, mobilidade e compras sem regra de API ativa permanecem fechados
para membros/gerentes, inclusive seus filhos; plataforma pode operar. Não há
scoping de empresa inventado para essas tabelas. `agent_actions` permite leitura
técnica ao Desenvolvedor e leitura/inserção da própria trilha à identidade de IA,
limitada à entidade própria e à tela correspondente. `llm_chamadas` é legível pela gestão financeira
com ao menos uma tela financeira e plataforma; só aceita inserção do processo
`fatura.visao` por sessão autorizada às telas de execução. Segredos e integrações
exigem plataforma; jobs e leitura de event_log exigem desenvolvedor.

`event_log` no runtime aceita INSERT com actor_type=user para sessão humana ou
actor_type=agent para credencial de IA, com ator igual à identidade autenticada;
SELECT é técnico. Inserções de auditoria comuns precisam evitar
RETURNING, pois RETURNING também exige a policy SELECT. O mesmo vale para
`llm_chamadas` quando o executor não tem acesso ao relatório financeiro. Não
amplie a leitura para fazer INSERT RETURNING funcionar.

Teste opt-in: `RUN_RLS_INTEGRATION_TESTS=true` e o runner local hermético do
integrador, com `--filter @plugga/api exec vitest run test/rls-permissoes.integration.spec.ts`.
O teste exige root de `plugga_os_test` em loopback/porta autorizada só para
fixtures, cria logins aleatórios em memória e faz as asserções em conexões reais
restritas. Limpa exclusivamente seus IDs/logins, preservando catálogos existentes
e auditoria append-only. Suíte pulada não comprova RLS; execute também lint,
typecheck, testes e build antes de declarar a entrega pronta. Não aplicar esta
migration a produção sem o provisionamento e a aprovação correspondentes.

As migrations seguintes completam os vínculos. `20261106020000_vinculos_e_agentes`
acrescenta a identidade de IA (73º modelo também ENABLE/FORCE), integridade de
autoria e constraints de concessão. `20261106030000_rls_identidade_agente` resolve
a credencial de IA revogável no banco, exige identidade ativa, membro de um único
departamento e sem papel de plataforma. Não aceita sessão humana de agente nem
contextos misturados. A trilha de IA exige entidade própria e tela correspondente;
o próprio agente não pode registrar uma aprovação humana.

`20261106040000_rls_leituras_relacionadas` preserva o cliente obrigatório do
contrato. CRM Contratos pode ler os cadastros necessários para criar contratos;
Financeiro lê somente clientes vinculados a contratos visíveis. Para membro,
contrato e cliente precisam pertencer à própria identidade. A projeção HTTP
do cliente no contrato continua limitada a id/nome e não concede sua tela nem
escrita no cadastro. Gerentes de CRM também podem resolver os responsáveis
Admin/Desenvolvedor elegíveis, que não possuem uma linha de departamento.
O diretório preserva também a resolução de responsáveis e autores históricos
dos registros autorizados à gerência, mesmo depois de saírem do CRM ou terem
a conta removida/desativada. Isso não os torna elegíveis a novas atribuições.

Contas ativas sem qualquer concessão continuam sem acesso a dados de negócio;
nenhuma permissão é preenchida automaticamente. A migração rejeita inconsistências
por contagem e preserva o histórico. Não apaga nem remapeia dados antigos.

`20261106050000_rls_vinculos_comerciais` acrescenta WITH CHECK aos vínculos de
oportunidades e contratos. Cliente opcional de oportunidade precisa estar no
escopo de Pipelines; oportunidade opcional de contrato precisa estar no escopo
e, quando tiver cliente, coincidir com o cliente do contrato. Gerência preserva
seu alcance por tela; uma FK existente não substitui a autorização do vínculo.

Pendência da revisão final (PLU-309): RLS de linhas, sozinha, ainda não mascara
colunas/JSON de referências e autoria alheias em registros próprios do legado.
As projeções HTTP ocultam esses campos, mas esse isolamento de campos ainda não
está completo no caminho SQL. A regra de manter a linha com campos ocultos ou
ocultá-la inteira aguarda decisão do André; não publicar como barreira concluída.
