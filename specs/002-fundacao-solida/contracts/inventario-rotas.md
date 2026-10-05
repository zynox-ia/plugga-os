# Contrato: inventário de rotas e regra "fechada por padrão"

Valida FR-020, FR-021 e FR-023. A API tem 130 rotas em 19 controllers, cada uma com seu `@UseGuards(...)`. Hoje um `RolesGuard` sem metadado libera.

## Regra

Toda rota HTTP da API declara **exatamente uma** destas:

| Marcador | Significado |
|---|---|
| `@Public()` | Aberta a qualquer um (lista aprovada pelo dono) |
| `@Authenticated()` | Qualquer usuário logado, declarado de propósito |
| `@Roles(...)` | Exige um dos papéis (na empresa do recurso, após a spec 002 fatia 3) |

Rota sem marcador é **negada** (modo `enforce`) ou **registrada em log** (modo `warn`).

Modo controlado por `ROUTE_GUARD_MODE=warn|enforce`; o padrão em produção é `enforce` depois da fatia 2, e a variável permite voltar a `warn` sem nova publicação.

## Formato do inventário

Arquivo `specs/002-fundacao-solida/contracts/inventario-rotas.json` (gerado; comparado por teste):

```json
[
  { "metodo": "POST", "caminho": "/auth/login", "controller": "AuthController.login",
    "acesso": "public", "papeis": [], "guards": ["OriginCheckGuard", "ThrottlerGuard"] },
  { "metodo": "GET", "caminho": "/energy-efficiency/studies/:id", "controller": "EstudoController.obter",
    "acesso": "roles", "papeis": ["opm", "diretoria", "admin"], "guards": ["SessionAuthGuard", "RolesGuard"] }
]
```

Campos: `metodo`, `caminho` (com prefixo global), `controller.handler`, `acesso` (`public`|`authenticated`|`roles`|`undeclared`), `papeis`, `guards`.

## Lista inicial de rotas públicas (a confirmar na tarefa T1.32)

`GET /health` e `GET /health/ready` (este restrito a rede interna), `POST /auth/login`, `POST /auth/invite/accept`, `POST /auth/reset/request`, `POST /auth/reset/confirm`, `POST /auth/google` (e retorno), `GET /auth/google/config` se existir. Qualquer outra é `authenticated` ou `roles`.

## Testes

1. **Inventário**: sobe o app em modo de teste, usa `DiscoveryService` e `Reflector` para listar as rotas, gera o JSON e compara com o versionado. Divergência falha o build e mostra o diff.
2. **Sem `undeclared`**: falha se qualquer rota estiver como `undeclared` (a partir da fatia 2; na fatia 1 apenas relata).
3. **Públicas aprovadas**: a lista de rotas `public` do inventário só muda com aprovação do dono (`CODEOWNERS` sobre o arquivo).
4. **Rota nova sem marcador**: teste de contrato registra um controller de teste sem marcador e confirma negação.
5. **Atalho de desenvolvimento**: com `NODE_ENV=production` ou fora de ambiente local/teste, o `DevHeaderAuthContext` não é registrado.
6. **Identificadores**: para toda rota com `:id`, enviar valor que não é UUID resulta em `REQUISICAO_INVALIDA` (nunca 500).

## Estado atual (gerado em 2026-10-05) e proposta para aprovação do dono (T067, T068)

O inventário (`inventario-rotas.json`, gerado por `apps/api/test/inventario-rotas.e2e.spec.ts`) lista **130 rotas em 19 controllers**:

| Acesso declarado | Rotas |
|---|---|
| `roles` | 116 |
| `undeclared` | 14 |
| `public`, `authenticated`, `permissions` | 0 (os marcadores `@Public` e `@Authenticated` ainda não estavam em uso) |

Todas as 116 rotas com `@Roles` têm `DevAuthGuard` e `RolesGuard` na pilha. As 14 sem declaração são estas; a coluna "proposta" é o que o dono precisa aprovar (T068):

| Método e caminho | Hoje | Proposta |
|---|---|---|
| `GET /health` | sem guard | `@Public()` |
| `POST /auth/login` | origem e limite de taxa | `@Public()` |
| `POST /auth/google` | origem e limite de taxa | `@Public()` |
| `POST /auth/accept-invite` | origem e limite de taxa | `@Public()` (o token do convite é a prova) |
| `POST /auth/reset/request` | origem e limite de taxa | `@Public()` |
| `POST /auth/reset/confirm` | origem e limite de taxa | `@Public()` (o token é a prova) |
| `GET /auth/me` | autenticação | `@Authenticated()` |
| `POST /auth/logout` | autenticação | `@Authenticated()` |
| `GET /auth/users` | autenticação; o serviço filtra por administrador ou gestor de departamento | `@Authenticated()` (a autorização fina fica no serviço) |
| `POST /auth/invite` | autenticação; o serviço exige administrador ou gestor | `@Authenticated()` (idem) |
| `PUT /auth/users/:id/access` | autenticação; o serviço decide | `@Authenticated()` (idem) |
| `POST /auth/users/:id/deactivate` | autenticação; o serviço exige administrador | `@Authenticated()` (idem) |
| `POST /auth/users/:id/resend-invite` | autenticação; o serviço decide | `@Authenticated()` (idem) |
| `GET /email/status` | autenticação e `RolesGuard` sem papel, ou seja, qualquer pessoa logada | `@Authenticated()` hoje; **decisão do dono**: restringir a `admin` e `tech`? |

Rotas candidatas a `public`, para o dono aprovar: as seis primeiras da tabela (`/health`, login, Google, aceitar convite, pedir e confirmar redefinição). Nada mais deve ser público.

Enquanto o dono não aprova, os marcadores **não** são aplicados às rotas: o guard global roda em `warn` (só registra) e nada muda de comportamento. Aplicar os marcadores e passar para `enforce` é a Fase 6c (T071 em diante).
