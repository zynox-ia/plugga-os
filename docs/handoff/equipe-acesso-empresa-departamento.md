# Handoff — Equipe com acesso por empresa e departamento

- **Branch:** `feat/core-equipe-acesso-empresa`
- **Data:** 2026-08-08
- **Bloco:** B — auth real (ADR-0008), auditoria (ADR-0007)

## Commits

| Hash | Propósito |
|---|---|
| `a0f557c` | Contratos em `packages/shared`, modelo de dados, migration, serviço/rotas de equipe, testes |
| `2c5c407` | Tela Equipe e acessos, navegação filtrada pelo membership, rotas de proxy |
| `d364794` | E2E de convite no novo contrato; `GET /auth/users` fora do throttle |
| `1f22c33` | Escrita de acesso falha alto se faltar papel no catálogo |
| `6ab8f8f` | Este handoff |
| `4b89706` | E2E de auth deixa de devolver a porta no meio da suíte |

## Desvio de partida — leia primeiro

O briefing pedia branch a partir de `main`. **A branch saiu de `feat/shell-empresa-departamento`
(`af59d1e`), não de `main`.** Motivo: `main` está 40+ commits atrás e **não tem**
`apps/web/app/lib/organizacao.ts`, `apps/web/app/configuracoes/` nem o
`EmpresaSwitcher` — exatamente os arquivos que o briefing manda ler e sobre os
quais a funcionalidade se apoia. Sair de `main` entregaria a Equipe sobre um
catálogo Empresa → Departamento que ainda não existe lá.

Nada foi rebaseado nem forçado, e nenhuma outra branch foi tocada. Se o merge
tiver de ir para `main` antes do shell, este trabalho precisa ser rebaseado por
quem for dono dessa decisão — não por este agente.

Durante a sessão **outro processo escreveu nesta mesma worktree** (Dockerfile,
`energy-efficiency`, PDF do estudo). Esses arquivos ficaram fora dos commits, no
estado em que estavam.

## Decisão de produto confirmada

Perguntado ao usuário: **desativar membro é só do admin de plataforma.** Gestor
de departamento convida e edita acesso no próprio escopo; para tirar alguém de
circulação ele revoga a empresa/departamento dentro do escopo dele, e a
desativação da conta (que derruba a sessão na plataforma inteira, inclusive em
empresas que ele não enxerga) fica com o admin.

## Modelo de dados

`user_roles` **deixou de existir**. No lugar:

| Tabela | Conteúdo |
|---|---|
| `companies` | Catálogo fixo `plugga`, `waze`. A chave é o próprio id, igual ao da navegação |
| `user_platform_roles` | Papel de plataforma (hoje só `admin`) |
| `user_company_memberships` | (user, company) — a linha existir **é** o acesso |
| `user_department_access` | (user, company, department, `is_manager`) |
| `user_company_roles` | (user, company, role) |

Ajustes finos em relação ao desenho do briefing, e o porquê:

- **`user_company_memberships` não tem coluna `status`.** Revogar é apagar a
  linha; `users.status` continua sendo o único controle de revogação de conta
  (ADR-0008). Dois controles para a mesma coisa divergem na primeira correção.
- **`companies` é tabela, não enum.** Dá integridade referencial de graça para
  as três tabelas de acesso, ao custo de duas linhas de seed. Não é tenant: o
  sistema segue single-tenant self-hosted.
- **Admin de plataforma não tem membership nenhum.** "Admin alcança as duas
  empresas" é regra aplicada na leitura (`visibleCompanies`/`visibleDepartments`
  em `packages/shared`), nunca linha materializada — assim a tela de edição
  mostra o que existe no banco e salvar de volta não cria acesso que ninguém
  concedeu.
- **`isManager` mora no acesso ao departamento**, não em papel global. "Gestor"
  nunca significa gestor de tudo.

## Migração dos papéis existentes

`apps/api/prisma/migrations/20260811000000_team_company_department_access/`

Ninguém perde nem ganha alcance. Hoje a sidebar não filtra nada — todo mundo
enxerga a Plugga inteira — e é exatamente esse estado que a migração escreve:

| Antes (`user_roles`) | Depois |
|---|---|
| `admin` | `user_platform_roles` (segue alcançando as duas) |
| qualquer outro papel | mesmo papel dentro da **Plugga** + membership |
| quem ganhou membership Plugga | **todos os 4 departamentos** da Plugga, sem gestão |

A **Waze não recebe ninguém**: não há como deduzir de um papel global quem
trabalha nela, e inventar acesso é pior do que um admin conceder depois. Quem
for da Waze precisa ser concedido pela tela após o deploy.

## Passos de migração e setup local

```bash
pnpm install
pnpm --filter @plugga/shared build       # contratos primeiro
docker compose up -d                     # Postgres local
pnpm --filter @plugga/api db:migrate     # aplica a migration
pnpm --filter @plugga/api db:seed
```

Para conferir a autorização logando com cada perfil, ative a equipe de exemplo
(**local apenas** — essas contas usam a mesma senha de `SEED_ADMIN_PASSWORD`):

```bash
SEED_SAMPLE_TEAM=true pnpm --filter @plugga/api db:seed
```

Cria `financeiro.plugga@` (só Plugga/financeiro), `gestor.energia@` (gestor de
energia-opm) e `duas.empresas@` (Plugga/comercial + Waze/engenharia).

## Verificação executada

```
pnpm lint       4/4 ok
pnpm typecheck  6/6 ok
pnpm test       386 passed | 22 skipped (408)
pnpm build      4/4 ok
```

`pnpm test` foi executado 8 vezes seguidas; `test/team.e2e.spec.ts` e
`test/auth.e2e.spec.ts` mais 40 vezes isoladas. Ver "flakiness herdada" abaixo.

### Migration validada contra os dados reais de produção

Autorizado pelo usuário em 2026-08-08. **A produção não foi alterada**: a
validação rodou numa cópia descartável (`plugga_os_migcheck`) restaurada de um
`pg_dump` do banco em uso, no mesmo Postgres da VPS, e apagada ao final —
`user_roles` segue com as suas 10 linhas e `companies` não existe lá.

| Verificação | Resultado |
|---|---|
| `psql -v ON_ERROR_STOP=1 -f migration.sql` sobre a cópia | aplica limpo |
| `prisma migrate diff` (banco migrado x `schema.prisma`) | **zero divergência** nas cinco tabelas novas |
| `prisma migrate deploy` do zero sobre a cópia restaurada | aplica só a pendente e registra em `_prisma_migrations` |
| `prisma db seed` (com `SEED_SAMPLE_TEAM=true`), duas vezes | idempotente, sem reconceder acesso |

Dados migrados, com os 3 usuários reais:

| Usuário | Antes | Depois |
|---|---|---|
| `admin@plugga.local` | `admin` | plataforma `admin` |
| `andrejunio.dev@gmail.com` | `admin` | plataforma `admin` |
| `dev@plugga.local` | os 8 papéis | plataforma `admin` + Plugga com 7 papéis e os 4 departamentos |

A divergência que o `migrate diff` ainda aponta é **anterior a este trabalho** e
não tem relação com ele: o default de `updated_at` (`@updatedAt` do Prisma não
emite default no banco, mas as migrations antigas criaram `DEFAULT
CURRENT_TIMESTAMP`) em `users`, `user_credentials`, `integrations` e
`bitrix_mirror_records`, e uma FK removida em `cycles`.

`apps/api/test/team.e2e.spec.ts` (21 casos, novo) cobre o aceite: `/auth/me` com
o acesso inteiro; admin convidando só Plugga/financeiro e depois concedendo
Waze/engenharia; gestor convidando no escopo; 403 ao conceder empresa,
departamento ou papel fora do escopo; 403 ao promover a admin; 403 ao editar
quem está fora do escopo; 403 no desativar por gestor; desativação derrubando a
sessão na hora; filtros da lista; reenvio de convite só enquanto pendente.

## Flakiness herdada — fora do escopo, diagnosticada

Os e2e de auth criavam um agente supertest por login, e cada agente abria e
fechava a própria porta efêmera; um agente que sobrevivia ao fechamento do
anterior batia numa porta já reciclada por outro processo da máquina e recebia
`400 "This is an explicit proxy server"`. Acontecia em ~1 execução a cada 7.
Corrigido em `4b89706` para `team.e2e` e `auth.e2e` (`await app.listen(0)` no
`beforeAll`, servidor no ar até o `afterAll`).

**`apps/api/test/energy-cycles.e2e.spec.ts` tem a mesma causa e continua
instável** (1 falha em 8 execuções da suíte completa). Não foi tocado: é de
outro workstream, que estava sendo editado nesta worktree durante a sessão. A
correção é a mesma linha, logo depois de `await app.init()`:

```ts
await app.listen(0);
```

## Riscos e o que NÃO foi verificado

1. **A migration exige deploy do código na mesma janela — ela NÃO é compatível
   com a versão no ar.** O build em produção (`plugga-os-api-1`) ainda consulta
   `user_roles` (`roles: { include: { role: true } }` na resolução de sessão, e
   `userRole` no repositório de auth). Aplicar a migration sozinha derruba a
   autenticação de todo mundo no instante em que a tabela cai. Migration e
   imagem nova sobem juntas, ou não sobem.

2. **Autorização de dados de domínio continua por papel achatado, não por
   empresa.** `flattenRoles` une papéis de plataforma e de todas as empresas
   numa lista só, que é o que `RolesGuard` consome. Quem é `financeiro` na Waze
   passa num `@Roles("financeiro")` de rota da Plugga. Isso é a granularidade que
   já existia e está fora do escopo desta fatia (mover `Client`, `Cycle` etc.
   para `companyId` é outro trabalho). **O que é por empresa hoje é a
   navegação.**

3. **Consequência direta: a filtragem da sidebar esconde, não bloqueia.** Quem
   não tem o departamento não vê o item, mas digitar `/energia-opm/ciclos` na
   barra de endereço ainda abre a tela e a API ainda serve o dado. Gatear a rota
   no middleware sem gatear o dado na API seria teatro. O fecho real depende do
   item 2 e deve vir junto com ele.

4. **Piscada de navegação otimista.** Enquanto `/auth/me` não responde, o shell
   desenha todas as empresas e departamentos e depois filtra. É opção
   consciente (comentada em `empresasPermitidas`): piscar "nenhuma empresa" para
   quem tem duas é pior. Não é vetor de acesso — a API recusa o que a sessão não
   permite.

5. **Gestor pode nomear outro gestor** do departamento que ele já gestiona
   (`canGrantManager: true` no escopo dele). Não amplia alcance — o novo gestor
   fica com o mesmo escopo ou menos — mas é decisão a confirmar com o negócio.

6. **Editar alguém "meio dentro" do escopo é 403 para o gestor.** Se a pessoa
   tem Plugga/financeiro *e* Waze/engenharia, o gestor de financeiro não a edita:
   salvar substitui o acesso inteiro e apagaria uma concessão que ele não vê nem
   poderia refazer. Admin edita normalmente.

7. **Contrato quebrado de propósito.** `POST /auth/invite` deixou de aceitar
   `roles: [...]` e passa a exigir `access: {...}`; `PUT /auth/users/:id/roles`
   virou `PUT /auth/users/:id/access`. Não há período de compatibilidade — os
   dois consumidores (e2e da web e a própria tela) foram migrados no mesmo
   commit. Qualquer script externo que chame essas rotas quebra.

## Superfície nova

**API** (`apps/api/src/auth/`, novo `TeamController`/`TeamService`)

| Rota | Quem pode |
|---|---|
| `GET /auth/users?companyId&departmentId&status` | admin ou gestor (gestor vê só o escopo dele + ele mesmo) |
| `POST /auth/invite` | admin ou gestor, dentro do escopo |
| `PUT /auth/users/:id/access` | admin ou gestor, dentro do escopo |
| `POST /auth/users/:id/deactivate` | **só admin**, nunca a si mesmo, nunca o último admin |
| `POST /auth/users/:id/resend-invite` | admin ou gestor, só enquanto `invited` |

`GET /auth/me` passa a devolver `access` além de `roles`.

Sem `@Roles` nessas rotas de propósito: a regra não é "tem o papel X", é "este
acesso cabe no escopo de quem pediu" — depende do alvo e do corpo, que um guard
por papel não enxerga. O escopo é relido do banco a cada requisição, para uma
revogação valer na requisição seguinte e não no próximo login.

`event_log` (append-only, ADR-0007) recebe: `auth.invite.created`,
`auth.invite.resent`, `user.access.updated`, `user.deactivated`.

**Web**

- `Configurações → Equipe e acessos` — lista com filtros, convite, edição de
  acesso, reenvio, desativação. Substitui as duas seções "em breve" (Equipe e
  Papéis e permissões): eram a mesma pergunta partida em duas telas.
- Sidebar e seletor de empresa filtrados pelo `access` da sessão.
- Proxies: `/api/auth/users`, `/api/auth/invite`, `/api/auth/users/[id]/{access,deactivate,resend-invite}`.
- `useSessionUser` virou contexto: uma leitura de `/me` por navegação, dividida
  entre shell, barra lateral, menu da conta e Configurações.

A tela **não recalcula** a regra de escopo: desenha o que o servidor mandou em
`scope`, `canManage` e `canDeactivate`. Uma segunda implementação da regra no
cliente acabaria mostrando botão que a API recusa.

## Sequência de deploy (quando for a hora)

A migration e a imagem precisam subir na mesma janela. Ordem:

1. `pg_dump` do banco em uso, guardado fora do container.
2. Publicar o código desta branch na VPS e **construir** a imagem nova (ainda
   sem trocar o serviço).
3. `prisma migrate deploy` — aplica só a pendente.
4. Subir a imagem nova de `api` e `web` imediatamente a seguir.
5. Conferir: login do admin, `/auth/me` trazendo `access`, e
   Configurações -> Equipe e acessos listando as 3 pessoas.

**Não rodar `SEED_SAMPLE_TEAM=true` em produção** — cria contas com a senha do
admin. Ela existe só para a máquina de quem desenvolve.

Rollback: restaurar o dump do passo 1 e voltar a imagem anterior. A migration
não tem `down` — `user_roles` é dropada e só volta pelo backup.

## Prontidão

Pronto para revisão do ARCHITECT (muda schema, auth e auditoria — exige review
antes de `main`, por `docs/AGENT.md`).

O que faltava verificar na migration **está verificado** contra os dados reais.
O que falta agora é uma decisão, não uma checagem: deployar esta branch em
produção antes do merge em `main` e antes da revisão do ARCHITECT é chamada do
dono do projeto, porque a migration derruba a autenticação se a imagem nova não
subir junto.
