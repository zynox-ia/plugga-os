# CLAUDE.md — contrato operacional do Plugga OS

Leia também [`docs/AGENT.md`](docs/AGENT.md) (contrato de contribuição) e os
[ADRs aceitos](docs/adr/README.md) antes de mudar fronteira de plataforma,
persistência, autenticação, integrações, auditoria ou jobs.

## O produto

**Plugga/Waze OS** é o sistema operacional **interno** da Plugga / Waze Energia:
CRM PluggaMob, eletropostos, financeiro operacional, ciclos OPM, integrações e
API para agentes.

> **Não é SaaS multi-tenant.** É single-tenant, hospedado na infra do cliente.
> Nunca introduzir dependência de conta SaaS de identidade (Supabase/Auth0/Clerk).
> Identidade e dados vivem no Postgres do projeto.

## ⛔ Limites não negociáveis (ADR-0011)

1. **Zero write em produção externa.** Nada de write/config/cutover/disparo em
   Bitrix, OMIE, PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw ou crons
   de produção. Migradores são **read_only por construção**.
2. **WhatsApp permanece no-op.** `POST /channels/whatsapp/send` é mock. Sem SDK,
   sem rede a gateway real.
3. **Cutover só por domínio**, com gate documentado e aprovação humana.
4. **Segredos só em `.env`/secret local** — nunca no git, nunca na tabela
   `integrations`, nunca em log ou evento.
5. **Sem SaaS de identidade** (ADR-0008).
6. **Jobs novos usam BullMQ + Redis**; crons legados são inventário read-only.
7. **`DEV_AUTH_ENABLED` off por default** fora de dev; proibido em produção.
8. **Sem Kafka, K8s, microserviços ou broker externo.**
9. **`event_log` e `agent_actions` são append-only.** Correção é registro novo,
   nunca mutação — há triggers no banco garantindo isso.

Se um pedido cruza uma dessas linhas, pare e escale antes de mudar código.

## Ambiente — não há Docker local

A máquina de desenvolvimento tem **apenas o código**. Toda a infraestrutura roda
na VPS dedicada `plugga-vps` (`82.29.152.21`, hostname `srv1653648`), que é uma
máquina **limpa** — não confundir com `hstgr-vps` (`2.24.208.189`), a VPS antiga
que roda o OpenClaw de produção e não deve ser tocada.

Na VPS, projeto Compose `plugga-os` em `/opt/plugga-os` (árvore copiada, **não é
um clone git**): `web` (3000), `api` (3001), `postgres` (5432), `redis` (6379),
`mailpit` (1025/8025) — **todas as portas bindadas em `127.0.0.1`**. Na frente,
**Caddy** (systemd) faz TLS e `reverse_proxy` de `os.plugga.app.br` → `:3000`.
O browser fala só com o Next; a API não é publicamente alcançável.

> O ADR-0012 descreve Traefik + Cloudflare Tunnel + prefixo `/backend` na VPS
> antiga. **Nunca foi executado e não é a topologia real.** Não use como
> referência de deploy.

### Loop de desenvolvimento

Como as portas da VPS são loopback-only, o dev local passa por um **túnel SSH
permanente**, instalado como serviço do usuário no macOS:

```text
~/Library/LaunchAgents/br.app.plugga.tunnel.plist
  ssh -N -L 5432 -L 6379 -L 1025 -L 8025 → plugga-vps
  RunAtLoad + KeepAlive: sobe no login e reconecta sozinho
  log: ~/Library/Logs/plugga-tunnel.log
```

Não é preciso subir nada à mão — `127.0.0.1:5432` (e 6379/1025/8025) já
apontam para a VPS. Diagnóstico e controle:

```bash
launchctl print gui/$(id -u)/br.app.plugga.tunnel | grep -E 'state|pid'
launchctl kickstart -k gui/$(id -u)/br.app.plugga.tunnel   # forçar reconexão
```

Escolhido em vez de publicar a 5432 na internet: o SSH já entrega TLS e
controle de acesso, e nenhuma porta nova é exposta (`ufw` segue 22/80/443).

Com o túnel de pé:

```bash
nvm use 24                              # .nvmrc; a máquina tem Node mais novo por default
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @plugga/shared build      # a API não compila sem isso
pnpm dev
curl --fail http://localhost:3001/health
```

### E-mail: convite e reset NÃO chegam a ninguém hoje

A VPS está com `EMAIL_PROVIDER=mailpit` — o adapter de **desenvolvimento**.
Mailpit é uma caixa falsa: aceita o e-mail e o guarda numa inbox local; nada
sai para a internet. Em produção isso significa que convite e reset de senha
somem em silêncio, com o sistema reportando sucesso.

O provedor decidido é **Brevo** (ADR-0010) e o adapter já existe
(`apps/api/src/email/brevo-email.adapter.ts`). Falta apenas configurar
`EMAIL_PROVIDER=brevo` + `BREVO_API_KEY` no `.env` da VPS. **Adiado**: depende
do cliente contratar um domínio novo — `plugga.app.br` não serve, tem **dois
registros SPF** (inválido pela RFC, tratado como erro permanente), sem DMARC e
sem DKIM do Brevo.

**Contorno até lá:** o admin cria o convite, abre <http://localhost:8025>
(Mailpit, via túnel), copia o link e entrega manualmente.

### ☠️ O `.env` local aponta para o banco de PRODUÇÃO

Isto é o efeito colateral do túnel e a armadilha mais perigosa do projeto:

- O guard em `apps/api/scripts/run-local-prisma.mjs` só valida o **hostname**
  (`localhost`/`127.0.0.1`/`postgres`). Com o túnel, `127.0.0.1:5432` **passa no
  guard e é a produção**.
- `pnpm db:migrate` é `prisma migrate dev` — em caso de drift ele oferece
  **reset destrutivo do banco**. Nunca rodar contra esse alvo.
- Use apenas `pnpm db:migrate:deploy`, e avise antes.
- `pnpm test:db`, `test:seed`, `test:jobs`, `test:email` também escrevem no banco
  apontado. Não rodar com o túnel aberto sem avisar.

## Fronteiras do repositório

```text
apps/web        Next.js
apps/api        NestJS (monólito modular)
packages/shared Contratos, DTOs, enums e eventos — livres de framework
packages/config Configuração de tooling compartilhada
```

1. `apps/*` podem depender de `packages/*`; `packages/*` **nunca** importam `apps/*`.
2. Web e API não se importam. Comunicam por HTTP usando `packages/shared`.
3. Módulos da API expõem interface pública intencional. Não importar controller,
   repository ou Prisma de outro módulo. Só implementações `*repository*` podem
   importar `PrismaService`, e todo módulo consumidor importa `PrismaModule`.
4. Ao mudar contrato HTTP: atualizar `packages/shared` **primeiro**, depois os
   consumidores.

## Gates antes de qualquer handoff

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Rodar testes de pacote mais estreitos enquanto itera é ok, mas esses quatro
comandos na raiz são o contrato. Timestamps em UTC no armazenamento;
apresentação e calendário em `America/Manaus`. Seeds e fixtures sintéticos,
sem credencial e sem PII.

## Disciplina de mudança

- Commits e PRs pequenos, um tema por PR.
- Toda mudança de fronteira/schema/auth/integração/auditoria precisa de ADR
  aceito antes do código.
- Nunca commitar `.env`, token, senha, webhook, endpoint real ou dado pessoal.
- Mascarar telefone/documento em log; sem PII completa em log algum.

## ⚠️ Estado atual: `main` não é o que está no ar

Verificado em 2026-08-07:

- A VPS roda o conteúdo da branch **`traycer/noble-lemur`** (24 commits, ~13.7k
  linhas: PluggaMob, Comercial/Clientes, Energia & OPM), que **nunca teve PR,
  review ou execução de CI**.
- O banco da VPS já tem as **9 migrations** dessa branch aplicadas; `main` tem 3.
- A **CI da `main` está vermelha**: 3 testes Playwright de invite/reset falham
  porque não encontram o e-mail no Mailpit.
- PR #12 (`chore/platform-dockerize-api-web`) está aberto e com CI reprovada.

Enquanto isso não fechar, trate `main` como **atrás da realidade**. O caminho
combinado é fatiar `noble-lemur` em PRs por domínio, com CI e review em cada um.

### Branches vivas

| Branch | O que é |
|---|---|
| `main` | fonte da verdade em git — atrás do que está no ar |
| `traycer/noble-lemur` | o que roda na VPS; a fatiar em PRs |
| `chore/platform-dockerize-api-web` | PR #12 aberto |
| `docs/deploy-topology-adr` | ADR-0012 (superado pelos fatos) |
| `feat/pluggamob-relationship` | tem specs de repositório que **não estão** em noble-lemur |
| `feat/pluggamob-settlements` | tem módulo `settlements/` que **não está** em noble-lemur |
| `feat/pluggamob-domain-foundation` | worktree com 10 arquivos **não commitados** |

As três últimas são implementações paralelas divergentes de PluggaMob, geradas
pelo run multi-agente. Não apagar sem decidir o que aproveitar.
