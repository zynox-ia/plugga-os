# ADR-0008 — Auth self-hosted single-tenant (Bloco B)

- **Status:** Aceito
- **Data:** 2026-08-06
- **Decisores:** ARCHITECT (Bloco B), em alinhamento com ORCHESTRATOR
- **Bloco:** B — Auth real + Migradores read_only
- **Supera parcialmente:** ADR-0004 (tira o auth do estado *stub*; mantém o seam `AuthContext`)

## Contexto

O Bloco A entregou autenticação como **stub** atrás da abstração `AuthContext`
(ADR-0004): um `DevHeaderAuthContext` que lê `x-dev-principal`/`x-dev-roles`,
gated por `DEV_AUTH_ENABLED` (default `false`, proibido em produção pelo
`environment.ts`). O modelo `users`/`roles`/`user_roles`, o `RolesGuard` por papel
e os papéis `admin/diretoria/pluggamob/financeiro/opm/tech/viewer` já existem.

O Bloco B precisa de **autenticação real** para o OS ser utilizável localmente e
depois em staging/VPS **do cliente**. A natureza do produto é **load-bearing**:

> **Plugga/Waze OS não é SaaS multi-tenant.** É sistema operacional interno,
> single-tenant, hospedado na infra do cliente. Identidade e dados vivem no
> **Postgres do projeto**.

Disso decorre uma proibição dura: **Supabase Auth / Clerk / Auth0 / qualquer SaaS
de identidade estão vetados como default.** A escolha é entre duas formas de
self-host: uma biblioteca de auth (Better Auth) ou auth nativo do stack
(Nest + Passport/sessão + Prisma sobre `users`/`roles`).

## Decisão

### Recomendação: **Nest + Passport (local) + sessão server-side em Postgres + Prisma**, sobre os `users`/`roles` existentes

Auth nativo do stack, atrás do seam `AuthContext` já existente. **Better Auth é
rejeitado como default** (ver Alternativas). A razão curta: a fundação já
comprometeu Prisma + `users`/`roles`/`user_roles` + `RolesGuard` + `AuthContext`,
e Better Auth traria um **segundo esquema de identidade** e um modelo de
integração por HTTP-handler que briga com a DI do NestJS e com o RBAC/auditoria já
contratados. O caminho nativo mantém a superfície de segurança pequena, revisável
e nativa, encaixando atrás do `AuthContext` com **zero churn nos domínios** —
exatamente a evolução que o ADR-0004 previu.

### O seam `AuthContext` é preservado

```mermaid
flowchart LR
  req[Request + cookie de sessão] --> auth[AuthContext - abstração core]
  auth -->|Bloco B default| sess[SessionAuthContext: valida sessão -> users/roles]
  auth -.->|escape hatch local: DEV_AUTH_ENABLED| dev[DevHeaderAuthContext]
  sess --> cur[AuthPrincipal id/kind/roles]
  dev --> cur
  cur --> guard[RolesGuard por papel/área]
  guard --> ctrl[Controllers de domínio]
```

- O provider default passa a ser um **`SessionAuthContext`** que resolve o cookie
  de sessão para um `AuthPrincipal` (`id`, `kind: user|service`, `roles`)
  consultando `users`/`roles` via Prisma. O contrato `AuthPrincipal` e o
  `RolesGuard` **não mudam**.
- `DevHeaderAuthContext` deixa de ser o caminho de produção e vira **escape hatch
  estritamente local**, atrás de `DEV_AUTH_ENABLED` (default `false`, já proibido
  em produção). Não é removido — é útil em testes/e2e — mas **nunca** é o provider
  default fora de dev.

### Fluxos B1 (login por e-mail+senha, sessão, logout, convite/reset)

| Fluxo | Decisão |
|---|---|
| **Hash de senha** | **Argon2id** (recomendação OWASP; parâmetros calibrados no server). bcrypt é fallback aceito, não preferido. Hash guardado em coluna nova de credencial ligada a `users`; nunca em log/evento. |
| **Sessão** | **Server-side, opaca, persistida em Postgres** (tabela `sessions`: id, `user_id` FK, hash do token, `expires_at`, `created_at`, metadados de device/IP). Cookie `httpOnly`, `Secure` (fora de local), `SameSite=Lax`, `Path=/`. |
| **Refresh / expiração** | Sessão com validade curta + **rotação** no uso (sliding) e expiração absoluta. Sem JWT stateless de acesso longo (ver Alternativas). Se JWT for adotado depois, o *refresh token* é uma sessão server-side revogável — o seam não muda. |
| **Logout** | Revoga a sessão no banco (delete/expire) e limpa o cookie. Revogação é **imediata** por ser server-side (motivo central da escolha sobre JWT). |
| **Convite** | Admin cria `users` sem senha + token de convite de uso único, expira em janela curta, entregue via `EmailPort` (ADR-0010). O convidado define a senha ao aceitar. |
| **Reset de senha** | Token de uso único, expira em janela curta, entregue por e-mail; invalida sessões ativas do usuário ao concluir. Não revela se o e-mail existe. |
| **Rate limit** | `@nestjs/throttler` nas rotas de auth (login, reset, convite, aceite). Limite por IP + por identidade; resposta genérica; lockout progressivo em tentativas de login. |
| **Cookies** | `httpOnly` sempre; `Secure` sempre que não-local; `SameSite=Lax`; sem token de sessão acessível a JS. CSRF: SameSite + verificação de origem nas rotas mutáveis. |

### RBAC (papéis existentes, camada de aplicação)

- Autorização segue no `RolesGuard` por papel, na camada de aplicação (não RLS —
  mantém ADR-0003/0004). Papéis: `admin`, `diretoria`, `pluggamob`, `financeiro`,
  `opm`, `tech`, `viewer`. Nenhum papel novo é introduzido no B1.
- `admin` administra usuários/papéis (convite, reset, atribuição de papel,
  desativação). Desativar usuário revoga sessões.
- **Agentes/OpenClaw continuam service principal** (`kind: "service"`,
  `id` com prefixo `service:`), **sem login de humano**, auditados em
  `agent_actions` (ADR-0007). Auth de serviço é por credencial de serviço em
  `.env`/secret local, não por sessão de cookie.

### Configuração e segurança (`DEV_AUTH_*` e afins)

- `DEV_AUTH_ENABLED` permanece **`false` por default** e **proibido em produção**
  (invariante do `environment.ts` do Bloco A, preservado). O `.env.example` pode
  mantê-lo `true` para dev local; nenhum ambiente não-dev o habilita.
- Segredos de auth (chave de assinatura de cookie/sessão, credencial de serviço)
  vivem só em `.env`/secret local — **nunca** no git. Adicionados ao schema de
  ambiente com validação, no mesmo padrão do Bloco A.
- **Nenhum SaaS de identidade** é introduzido. Nenhuma chamada de auth sai do
  perímetro do cliente (exceto e-mail transacional via `EmailPort`, ADR-0010).

## Consequências

**Positivas**
- Encaixa no stack e no seam existentes: `AuthContext`/`AuthPrincipal`/`RolesGuard`
  e `users`/`roles` são reusados sem churn nos domínios.
- Superfície de segurança pequena, própria e **revisável** — sem esquema de
  identidade paralelo nem dependência opinativa dona da identidade.
- Sessão em Postgres = revogação imediata (logout, desativação, troca de papel),
  SoT único, alinhado à auditoria append-only.
- Single-tenant não paga por breadth multi-tenant/social que não usa.

**Negativas / custos**
- Mais código próprio a escrever e manter (reset/convite/rate-limit/lockout) — a
  partir de primitivas conhecidas, e sob review do ARCHITECT. É custo aceito em
  troca de controle sobre a superfície de segurança.
- Detalhes de segurança (rotação, CSRF, lockout) precisam ser feitos corretamente
  por nós; mitigado por revisão e testes e2e de login (aceite B1).

**Neutras**
- Redis (ADR-0007/BullMQ) está disponível, mas a sessão fica em Postgres para
  manter SoT único e não acoplar disponibilidade de auth ao Redis. Redis como
  store de sessão é otimização futura, não decisão de fundação.

## Alternativas consideradas

| Alternativa | Otimiza para | Por que **não** como default |
|---|---|---|
| **Better Auth** (Prisma adapter) | Baterias inclusas (reset/verify/2FA/rate-limit), menos código | Dono do **próprio esquema** (`user`/`session`/`account`) → **segunda identidade** conflitando com `users`/`roles`; modelo de mount por HTTP-handler briga com DI do Nest; plugin de RBAC não mapeia `roles`/`user_roles`/`RolesGuard`; adiciona dependência grande dona de superfície load-bearing. Custo de integração > economia de código num tool single-tenant. **Reconsiderar** só se o volume de features de auth (2FA, magic link, org) crescer a ponto de o build próprio virar passivo. |
| **JWT stateless + refresh** | Menos leitura de sessão no banco | Revogação cara: logout/desativação/troca de papel não são imediatos sem denylist — que reintroduz estado server-side. Num tool interno, revogação imediata vale mais que economizar um SELECT. Fica documentado como evolução se surgir gargalo de leitura de sessão. |
| **Supabase Auth / Clerk / Auth0** | Setup rápido | **Proibido**: SaaS de identidade fora do perímetro do cliente; contraria "não é SaaS / self-hosted". |
| **RLS de banco para authz** | Authz no banco | Amarra hospedagem e enfraquece portabilidade do ORM (ADR-0003/0004). Authz segue app-layer. |
| **Passport puro sem sessão server-side** | Simplicidade de libs | Passport entra só como *local strategy* de login; a sessão revogável em Postgres é o que sustenta logout/desativação. Passport é detalhe de implementação, não a decisão. |

## Gatilhos de revisão

- Requisito de 2FA / magic link / SSO corporativo → reavaliar build próprio vs
  Better Auth/OIDC self-hosted (ex.: Keycloak/Zitadel na VPS do cliente), sempre
  atrás do mesmo `AuthContext`.
- Necessidade de permissões finas (por ação, não por papel) → refinar RBAC
  (gatilho já herdado do ADR-0004).
- Gargalo de leitura de sessão → mover store de sessão para Redis (o seam não
  muda) ou adotar JWT+refresh com denylist.
- Multi-empresa/tenant (mudaria a natureza do produto) → reabrir esta decisão por
  completo.

## Guardas de escopo

- Nenhum SaaS de identidade é introduzido; nenhuma identidade sai do perímetro do
  cliente.
- Nenhum segredo de auth entra no repositório (só `.env`/secret local).
- `DEV_AUTH_ENABLED` nunca é o caminho de auth fora de dev; segue `false` por
  default e proibido em produção.
- Este ADR não autoriza write/cutover em nenhum sistema externo — apenas
  autenticação local do próprio OS.
