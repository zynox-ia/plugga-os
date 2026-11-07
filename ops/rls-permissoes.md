# Permissões por tela e RLS (PLU-306 / PLU-309)

O contrato atual é **acesso por tela**. Membro com `crm.pipelines` pode ver e
trabalhar todos os leads dessa tela; responsável e autoria não restringem a
leitura. Gerência vale no departamento e nas telas concedidas, sem combinar
nível de um departamento com tela de outro. Admin mantém o alcance
administrativo; Desenvolvedor acrescenta as telas técnicas.

As migrations desta entrega protegem **73 modelos com ENABLE + FORCE RLS**:
`20261106010000_isolamento_rls` cobre os 72 originais e
`20261106020000_vinculos_e_agentes` acrescenta `agent_identities`.
`20261106060000_permissoes_por_tela` substitui a regra anterior por responsável,
fecha a leitura de Clientes e acrescenta a conversão controlada e os triggers
de escrita. Nenhum dado histórico é apagado ou remapeado.
`_prisma_migrations` é metadado do migrador, não um modelo de negócio.

| Conexão | Grupo | Capacidade |
| --- | --- | --- |
| `DATABASE_URL` | `plugga_runtime` | Negócio com contexto autenticado e policies por tela |
| `AUTH_DATABASE_URL` | `plugga_auth_runtime` | Autenticação, equipe, ACL e identidades; auditoria de autenticação |
| `JOBS_DATABASE_URL` | `plugga_jobs_runtime` | integrations, job_runs, bitrix_mirror_records e auditoria de sistema |

São três logins distintos, sem SUPERUSER, BYPASSRLS, propriedade de objetos,
herança do migrador, CREATE/DDL, TRUNCATE ou privilégios de outro pool. Os grupos
são NOLOGIN. O pool auth não acessa negócio; jobs não acessa usuários,
credenciais ou negócio. O validador de boot recusa pools incompatíveis; o
modo de testes unitários não substitui a execução explícita dos testes RLS.

O contexto vem da sessão humana ou da credencial de IA validada. A aplicação
define `plugga.session_hash` ou `plugga.agent_hash` por `set_config(..., true)`
na mesma conexão/transação das consultas. `usuario_id()` exige identidade
ativa e credencial/sessão vigente; contextos misturados e UUIDs forjados não
autenticam. Helpers privilegiados usam SECURITY DEFINER, search_path fixo,
tabelas qualificadas e EXECUTE revogado de PUBLIC. Runtime nunca recebe SELECT
das sessões ou credenciais.

No runtime, `users` concede SELECT somente de **id, name e status**, ainda
sujeito à policy de diretório. Isso permite responsáveis elegíveis e autoria
dos registros visíveis, sem e-mail nem cadastro completo da conta. Nomes
históricos permanecem após desativação ou mudança de departamento; isso não
torna a pessoa elegível a novas atribuições. Atribuir a terceiros exige gestão
da tela no CRM ou plataforma e destinatário ativo/elegível; os triggers de
`validar_escrita_crm` complementam a validação da API.

Pipelines compartilha leads, contagens, equipe, documentos e propostas da tela
autorizada. Filhos continuam vinculados ao negócio correto: um ID de arquivo
ou proposta não autoriza usá-lo no caminho de outro negócio. Perfil, contato,
autoria e histórico são dados/snapshots do lead visível, inclusive ações de
outras pessoas. Não acompanham alterações posteriores do cadastro convertido.

**Clientes exige `crm.clientes`**, inclusive seletores, duplicatas, contatos e
leitura do cadastro. Converter não concede essa tela. Sem ela, o lead mantém
seu snapshot e informa `converted: true`, mas sua projeção `client` é nula; a
resposta da conversão traz `client: null` e `created: null`, sem nome ou ID do
cadastro, candidatos ou link para ele. A escolha manual de cliente exige Clientes.
O trigger impede criar ou alterar diretamente esses vínculos sem a tela,
preservando vínculos anteriores durante as demais edições do lead.

A única assinatura de conversão exposta é
`plugga_security.converter_lead_snapshot(alvo uuid) RETURNS boolean`.
Ela recebe somente o ID do lead, revalida a identidade/tela após as travas e
usa o perfil e os contatos já persistidos para criar ou vincular o cliente.
Não aceita payload de cadastro nem ID de cliente escolhido pelo chamador.
Com Clientes, retorna true se criou e false se reutilizou/já estava vinculado;
para Pipelines sem Clientes, retorna sempre NULL. Casos que precisam de
validação de cadastro falham com orientação genérica, sem devolver candidatos.
EXECUTE é concedido ao runtime, não a PUBLIC. As policies exclusivas do dono
para essa operação não são concedidas aos pools de aplicação.

Contratos seguem as telas já existentes de CRM/Financeiro, sem conceder acesso
ao cadastro de Clientes. `clientes_dos_contratos(uuid[])` retorna somente
`contract_id`, id e nome do cliente vinculado aos contratos autorizados.
A oportunidade opcional deve ser coerente com o cliente; criar ou trocar esse
vínculo exige Pipelines. **Isolamento por responsável de contratos fica adiado**;
esta entrega não cria a regra de “contrato próprio” nem redesenha Financeiro.

IA conserva identidade de equipe, nível Membro em um único departamento, sem
login humano ou papel de plataforma. Seu alcance das entidades segue a tela,
como o humano. A trilha continua vinculada à própria identidade, não permite
autoaprovação e não abre trilhas alheias ou telas técnicas. `event_log` exige
ator igual à identidade autenticada; leitura técnica de eventos/jobs exige
Desenvolvedor. Auditoria e registros LLM devem evitar INSERT RETURNING quando
a sessão não tem SELECT da tabela.

Roles, companies e templates de proposta são catálogos globais de leitura
para sessão ativa; company não é tenant. Domínios sem regra operacional ativa
permanecem fechados a Membro/Gerente. As funções restritas do executor de faturas
não concedem SELECT de tabelas de integrações/segredos nem sua configuração.

Para ativar, provisione os três logins fora do repositório e execute
`configurar-papeis-aplicacao.sql` com `runtime_role`, `auth_role` e
`jobs_role`. O script valida e concede grupos; não cria senhas/logins.
Coordene as migrations com a versão que propaga o contexto: rollback apenas
do aplicativo antigo pode interromper o acesso. Produção exige aprovação
explícita do André e não foi acessada por esta atualização documental.

A evidência de execução fica no PR e no Linear, com SHA e ambiente. Os arquivos
`rls-permissoes.integration.spec.ts`, `isolamento-membros.integration.spec.ts`
e `vinculos-equipe.integration.spec.ts` usam, respectivamente, as flags opt-in
`RUN_RLS_INTEGRATION_TESTS`, `RUN_PERMISSOES_INTEGRATION_TESTS` e
`RUN_VINCULOS_INTEGRATION_TESTS` com valor `true`, em ambiente local sintético
com `PLUGGA_TEST_IGNORE_ENV_FILE=true`. Preparação usa conexão
administrativa somente para fixtures; as asserções usam logins restritos.
Suítes puladas, leitura de código e nomes de etapas da CI não comprovam
execução. Este documento descreve o contrato implementado e não certifica
gates de CI, navegador ou produção que não tenham sido efetivamente executados.
