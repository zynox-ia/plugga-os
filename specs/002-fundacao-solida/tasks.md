---

description: "Lista de tarefas da spec 002: Fundação sólida do Plugga OS"
---

# Tarefas: Fundação sólida do Plugga OS

**Input**: `specs/002-fundacao-solida/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Pré-requisitos**: plan.md e spec.md aprovados; ADR-0013 aceito (revisão técnica do ARCHITECT pendente, necessária antes da Fatia 3).

**Testes**: incluídos. A spec exige verificação mensurável (SC-001 a SC-026) e a constituição (princípio V) exige que toda correção tenha teste que falhava antes.

**Organização**: tarefas agrupadas por história de usuário e, dentro da execução, pelas **4 fatias** do plano. A ordem das fases segue a ordem de entrega das fatias, não só a prioridade P1/P2/P3 (por exemplo, US4 é P1 mas sua migração é a Fatia 3).

## Formato: `- [ ] Txxx [P?] [USn?] Descrição com caminho`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[USn]**: história da spec. Fases de Setup, Fundação e Acabamento não têm rótulo de história.
- **`[DONO]`**: ação que só o dono pode fazer (conta, aprovação, configuração do GitHub). A IA prepara o roteiro e espera.
- **`[VPS]`**: altera o servidor de produção. Exige aprovação explícita do dono, backup restaurado antes (T012) e plano de reversão escrito (constituição VI).
- **`[F1]`..`[F4]`**: fatia do plano, quando a história atravessa fatias.

## Convenções de caminho

> **Regra para tudo o que roda na VPS** (constituição VI): migração e script de dados rodam **na própria VPS**, por `docker compose run` no padrão de `ops/deploy.sh`, com variáveis de produção explícitas; nunca a partir da máquina de desenvolvimento.


Monorepo pnpm: `apps/api/src/`, `apps/api/prisma/`, `apps/api/test/`, `apps/web/app/`, `packages/shared/src/`, `ops/`, `scripts/`, `.github/`, `docs/`. Cada tarefa que altera schema ou dados cria `rollback.sql` ao lado da migração.

---

## Phase 1: Setup e pré-requisitos

**Propósito**: preparar o terreno e coletar o que só o dono pode dar. Nada aqui altera produção.

- [ ] T001 [DONO] Informar se o repositório `zynox-ia/plugga-os` é público ou privado e se aceita forks; registrar a resposta em `ops/GUIA.md` (seção "Segurança da publicação") (P4)
- [ ] T002 [DONO] Escolher no mínimo dois aprovadores de publicação e registrar os nomes em `.github/CODEOWNERS` (a criar na T014) e em `ops/GUIA.md` (P3)
- [ ] T003 [DONO] Criar conta e bucket no Backblaze B2 com Object Lock em modo governança, retenção de 35 dias, versionamento ligado; criar duas chaves de aplicação (uma só de escrita, uma só de leitura) e entregá-las por canal seguro, nunca no repositório (P1)
- [ ] T004 [DONO] Gerar o par de chaves `age` do dono, guardar a privada offline com cópia e entregar só a chave pública; registrar a pública em `ops/backup/age-recipients.txt` (P2)
- [ ] T005 [DONO] Criar conta no healthchecks.io e no monitor HTTP externo, entregar as URLs de ping (P6)
- [ ] T006 [DONO] Entregar a lista de nomes de clientes por canal seguro e cadastrá-la como segredo `CLIENT_NAMES` do GitHub (P7)
- [ ] T007 [DONO] Confirmar a revisão técnica do ADR-0013, incluindo a simplificação de não trocar as tabelas de acesso na spec 002; anotar o resultado em `docs/adr/0013-empresa-como-atributo-modulos-compartilhados.md` (P9)
- [X] T008 Confirmar os itens "não verificados" da auditoria sem imprimir segredo: (a) o Next.js decodifica `%2F` em `params` de rota de API; (b) a produção define `WEB_TRUST_PROXY` e `TRUST_PROXY` atrás do Caddy; (c) os segredos de produção não são os valores de exemplo; (d) `prisma migrate diff` quer remover os índices únicos parciais; (e) `consumo.controller.ts` injeta sem `@Inject` e funciona sob Vitest. Registrar cada resposta em `specs/002-fundacao-solida/research.md` (seção "Itens verificados")
- [X] T009 [P] Criar a estrutura de pastas novas vazias com `.gitkeep` apenas onde necessário: `ops/backup/`, `ops/cron/`, `ops/caddy/`, `scripts/`, `apps/api/src/common/errors/`, `apps/api/src/audit/`
- [X] T010 [P] Adicionar ao `package.json` raiz os scripts `test:scan-dados`, `test:migrations:rollback` e `test:routes-inventory` apontando para os arquivos que as tarefas seguintes criam (stubs que falham com mensagem clara até existirem)
- [X] T011 [P] Escrever a seção "Como esta feature é verificada" em `specs/002-fundacao-solida/quickstart.md` ligando cada fatia aos scripts reais criados (atualizar nomes se mudarem)
- [X] T012 Criar `ops/restaurar-teste.sh` mínimo (restaura o dump mais recente em contêiner descartável e confere contagem de tabelas) e `ops/restaurar-teste.test.sh` com casos: feliz, origem vazia (deve falhar), dump adulterado (deve falhar). Este roteiro é o "backup restaurado antes" exigido de toda tarefa `[VPS]` (FR-016, constituição VI)

**Checkpoint**: respostas do dono registradas; ferramenta de restauração existe.

---

## Phase 2: Fundação (bloqueia as histórias que dependem de contratos compartilhados)

**Propósito**: contratos e peças usados por mais de uma história. Nenhuma altera comportamento visível.

**⚠️ CRÍTICO**: US6, US7, US8, US10, US12, US16 dependem desta fase.

- [X] T013 [P] Criar o schema zod do envelope de erro em `packages/shared/src/erro.ts` com os campos `codigo`, `mensagem`, `requestId`, `detalhes?` e o catálogo de códigos de [contracts/erro-envelope.md](contracts/erro-envelope.md); exportar em `packages/shared/src/index.ts`
- [ ] T014 [P] Criar `.github/CODEOWNERS` cobrindo `.github/workflows/**`, `ops/**`, `compose*.yaml`, `apps/*/Dockerfile`, `specs/002-fundacao-solida/contracts/inventario-rotas.json` e `.specify/memory/constitution.md`, usando os aprovadores da T002
- [X] T015 [P] Estender o catálogo de eventos em `packages/shared/src/events.ts` com a estrutura `{ descricao, escopo, pii: false }` por evento e o padrão `<dominio>.<entidade>.<acao_no_passado>` de [contracts/catalogo-eventos.md](contracts/catalogo-eventos.md); manter os nomes atuais como `legados`
- [X] T016 Implementar `AuditAppender` em `apps/api/src/audit/audit-appender.ts` com `append(tx, evento)` tipado por `EventName`, que exige transação, grava `company_id` **quando a coluna existir** (migração T071; antes dela o campo é omitido) para eventos de escopo `empresa`, e rejeita `payload` com chaves proibidas (nome, e-mail, telefone, documento, cnpj, cpf, endereço) ou valores com formato de e-mail/documento; exportar pelo `audit.module.ts`
- [X] T017 [P] Teste do `AuditAppender` em `apps/api/src/audit/audit-appender.spec.ts`: rejeita payload com e-mail, aceita `{campos:["nome"]}`, exige `tx`
- [X] T018 [P] Criar script de lint estático `scripts/verifica-eventlog.mjs` que falha se `eventLog.create` aparecer fora de `apps/api/src/audit/`; ligar ao `pnpm lint` do API
- [X] T019 [P] Criar `apps/api/src/common/errors/dominio.ts` com os erros de domínio `EstadoInvalido`, `NaoEncontrado`, `Conflito` e `LimiteExcedido`, sem dependência de HTTP
- [X] T020 Criar o filtro global de exceções em `apps/api/src/common/errors/filtro-global.ts` que converte exceções HTTP do Nest, erros do Prisma (`P2002`→`CONFLITO_UNICIDADE`, `P2025`→`NAO_ENCONTRADO`, `P2034`→repetir a transação uma vez e, se persistir, `CONFLITO_ESTADO`), erros zod e erros de domínio no envelope da T013, com `mensagem` em português sem detalhe interno; registrar como `APP_FILTER` em `apps/api/src/app.module.ts`
- [X] T021 [P] Testes do filtro em `apps/api/test/erro-envelope.e2e.spec.ts`: cada código do catálogo tem um caso que o produz; varredura das mensagens procurando `prisma`, `postgres`, `ECONN`, caminhos de arquivo
- [X] T022 [P] Criar o middleware de `requestId` em `apps/api/src/common/request-id.middleware.ts` (gera ULID, devolve no cabeçalho `x-request-id`, entra no log e no envelope de erro)
- [X] T023 [P] Criar os testes de não regressão das bases a preservar (FR-080) em `apps/api/test/bases-preservadas.spec.ts`: sessão opaca guardada só por hash, cookie assinado `httpOnly`/`Secure`/`SameSite=Lax`, Argon2id e tempo igual para conta inexistente, tokens de convite e redefinição de uso único, validação de ambiente que falha na inicialização, `TRUST_PROXY=true` recusado em produção, travas otimistas (`updateMany` condicionado) em Comercial/Obras/Compras/Auth, `timestamptz` e `Decimal`, gatilhos append-only, papel de banco só com DML
- [X] T024 [P] Criar os testes de não regressão do web em `apps/web/test/bases-preservadas.test.ts` e `apps/web/e2e/seguranca.spec.ts`: CSP com nonce, cabeçalhos de segurança, `safe-redirect`, `forwarded-for` (uma IP validada, cadeia descartada)

**Checkpoint**: contratos de erro, evento e auditoria existem e estão testados; nenhuma rota mudou de comportamento ainda.

---

# FATIA 1: publicação, dados de cliente, backup, inventário (não toca dados nem comportamento da aplicação)

## Phase 3: US1 Só código revisado chega à produção (P1) 🎯 MVP

**Meta**: um PR, fork ou branch qualquer nunca publica na produção; publicação exige aprovação humana e é exclusiva.

**Teste independente**: simular o evento de CI vindo de PR, de fork e de push na `main` oficial e conferir que só o último chega ao passo de aprovação.

- [ ] T025 [DONO] [US1] Ligar a proteção da `main` nas configurações do GitHub: PR obrigatório, revisão de CODEOWNERS, checks obrigatórios, sem push forçado; registrar a data em `ops/GUIA.md`
- [ ] T026 [DONO] [US1] Criar o ambiente `production` no GitHub com os aprovadores da T002
- [X] T027 [P] [US1] Criar `scripts/simula-deploy-evento.mjs` que lê um JSON de evento `workflow_run` e avalia as condições do job de deploy, e as fixtures `scripts/fixtures/workflow_run_pr_fork_main.json`, `workflow_run_push_main.json`, `workflow_run_push_sha_antigo.json`; teste em `scripts/simula-deploy-evento.test.mjs` (hoje deve FALHAR para o caso de fork)
- [X] T028 [US1] Alterar `.github/workflows/deploy.yml`: `if` com `conclusion == 'success'` e `event == 'push'` e `head_repository.full_name == github.repository` e `head_branch == 'main'`; `environment: production`; `permissions: contents: read`; `concurrency: { group: deploy, cancel-in-progress: false }`; `timeout-minutes: 20`
- [X] T029 [US1] No mesmo `deploy.yml`, acrescentar passo que busca a ponta atual da `main` e sai com sucesso sem publicar se `head_sha` não for essa ponta (um deploy mais novo virá); atualizar a `scripts/simula-deploy-evento.mjs` para refletir
- [X] T030 [US1] Alterar `.github/workflows/ci.yml`: o job `corpus` deixa de rodar em `pull_request`; roda só em `push` na `main` e em agenda; PRs não agendam job no runner `plugga-vps` (solução interina até a T170)
- [X] T031 [P] [US1] Adicionar trava exclusiva (`flock` em `/var/lock/plugga-deploy.lock`, falha imediata com mensagem se ocupada) em `ops/deploy.sh` e `ops/publicar.sh`; teste em `ops/deploy-trava.test.sh` com duas execuções simultâneas (a segunda deve recusar)
- [X] T032 [US1] Atualizar `ops/GUIA.md`: `publicar.sh` é caminho de emergência, exige o mesmo SHA aprovado e usa a mesma trava; descrever o fluxo de aprovação (FR-004, FR-005)
- [ ] T033 [US1] Revisar com o dono e abrir PR da US1; após merge, abrir PR de teste de um fork (ou simulação) e confirmar que o deploy não dispara

**Checkpoint**: SC-001 verificado. Esta é a entrega mínima (MVP).

---

## Phase 4: US2 Dados de clientes fora do repositório (P1)

**Meta**: 0 CNPJ, CPF, unidade consumidora ou nome de cliente real na árvore e no histórico; a CI barra reintrodução.

**Teste independente**: o scanner passa na árvore limpa e falha em um commit que reintroduz um CNPJ válido não permitido.

- [X] T034 [US2] Inventariar ocorrências em `packages/auditoria-oraculo/referencia/**`, `apps/api/src/energy-efficiency/**` e `apps/api/prisma/seed.ts`; gravar relatório **sem valores** (arquivo, linha, tipo) em `specs/002-fundacao-solida/relatorio-dados-cliente.md`
- [X] T035 [P] [US2] Implementar `scripts/scan-dados-cliente.mjs`: CNPJ e CPF com e sem pontuação **validando o dígito verificador**, padrões de unidade consumidora (`uc-<número>`, `UC 0000000-0`; exemplos sempre sintéticos), nomes lidos de `CLIENT_NAMES_FILE` (sem acento, sem diferença de caixa), lista de permitidos em `scripts/dados-sinteticos-permitidos.json`, modos `--tree` e `--history`, relatório sem imprimir o valor; a varredura inclui `specs/`, `docs/` e `.github/`
- [X] T036 [P] [US2] Testes do scanner em `scripts/scan-dados-cliente.test.mjs` com valores 100% sintéticos: acha CNPJ válido, ignora número de 14 dígitos com dígito inválido, acha nome da lista, respeita a lista de permitidos, não imprime o valor no relatório, e acusa um UC ou CNPJ colocado em um `.md` de `specs/` ou `docs/`
- [X] T037 [US2] Adicionar o scanner ao `.github/workflows/ci.yml` em modo **aviso** (relata, não falha), lendo `CLIENT_NAMES` do segredo (T006)
- [X] T038 [P] [US2] Criar `scripts/gera-fixtures-sinteticas.mjs`: gera deterministicamente (semente fixa) CNPJ/CPF com dígito válido numa faixa reservada e documentada, nomes e UCs fictícios, preservando formato e faixas de valores; grava a lista de permitidos
- [X] T039 [US2] (decisão do dono em 2026-10-05: remover em vez de substituir; vide relatório) Substituir os arquivos reais de `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/*.json` e `*.md` por fixtures sintéticas equivalentes e atualizar `golden-hashes.json`; confirmar `pnpm --filter @plugga/auditoria-oraculo test` verde
- [X] T040 [US2] (removido, não substituído) Substituir dados reais em `apps/api/src/energy-efficiency/nucleo/templates/` e `apps/api/src/energy-efficiency/fatura/golden/` por sintéticos; confirmar `pnpm --filter @plugga/api test` verde e que os mesmos comportamentos continuam cobertos
- [X] T041 [US2] Revisar `apps/api/prisma/seed.ts` e `apps/web/public/fonts/` (arquivo com número que casou o padrão) para confirmar se são dado de cliente; corrigir ou documentar como falso positivo na lista de permitidos
- [ ] T042 [US2] Mover os arquivos reais removidos para o balde `plugga-corpus-faturas` com chave de leitura; confirmar que `pnpm --filter @plugga/api corpus:baixar` os traz para teste local e que os testes de regressão passam com eles
- [x] T043 [US2] (modo falha ligado em `ci.yml`; provado no PR #31, fechado sem mesclar: o passo "Scan tree for real client data" falhou com 1 CNPJ válido fora da faixa sintética) Alterar o scanner para modo **falha** no `.github/workflows/ci.yml` e confirmar com um PR de teste que adiciona um CNPJ válido não permitido (deve falhar)
- [X] T044 [US2] Remover da árvore atual os arquivos reais restantes e atualizar `.gitignore`; rodar `node scripts/scan-dados-cliente.mjs --tree` com `CLIENT_NAMES_FILE` (inclui `specs/` e `docs/`; deve dar 0 ocorrências)
- [X] T045 [US2] Atualizar `ops/GUIA.md` e `docs/AGENT.md` com a regra "dado real só no balde do corpus, nunca no git" e como baixar o corpus
- [ ] T046 [DONO] [US2] **BARREIRA**: combinar a janela; todas as outras frentes (US1, US3, US5 e demais) mergeiam ou pausam antes, e depois da T049 todos rebaseiam sobre o novo histórico; congelar a `main`, mergear ou abandonar PRs em andamento (P5) e desligar o deploy automático durante a operação
- [ ] T047 [US2] Reescrita do histórico (D9): clone espelho novo, cópia offline criptografada do espelho original guardada por 30 dias, `git filter-repo` com `--path` e `--replace-text` conforme o relatório da T034 (incluindo valores de dado de cliente que entraram em `specs/` e `docs/` e nas branches `claude/*`), varredura do espelho reescrito com `--history` (0 ocorrências), `git push --force --mirror` com a proteção suspensa só nesse passo e restabelecida em seguida; roteiro executável em `ops/reescreve-historico.md`
- [ ] T048 [DONO] [US2] Abrir pedido ao suporte do GitHub para remover `refs/pull/*` e o cache de visualização dos commits antigos; todos refazem o clone; refazer o checkout do runner da VPS `[VPS]`
- [ ] T049 [US2] Rodar a varredura do histórico inteiro no clone novo, registrar data e o novo hash do HEAD em `ops/GUIA.md`, descongelar a `main` e reativar o deploy; revisar ADRs e docs que citam hashes antigos

**Checkpoint**: SC-002 verificado; histórico limpo.

---

## Phase 5: US3 Backup que sobrevive à perda do servidor (P1)

**Meta**: banco e arquivos de negócio têm cópia criptografada fora da VPS, restauração testada toda semana e alerta de falha.

**Teste independente**: executar o backup, restaurar em ambiente descartável e conferir contagens e checksum; derrubar o backup de propósito e ver o alerta.

- [X] T050 [P] [US3] Criar `ops/backup/baldes.txt` listando os baldes de negócio e `plugga-corpus-faturas` (excluir `plugga-backups`); o formato do backup é o de [contracts/backup-formato.md](contracts/backup-formato.md)
- [X] T051 [US3] Implementar `ops/backup-externo.sh` (`set -euo pipefail`, mensagens em português): `pg_dump -Fc`, espelho dos baldes de `baldes.txt` para diretório temporário, `tar`, `age` com os destinatários de `ops/backup/age-recipients.txt` (dono e teste), manifesto conforme o contrato, envio ao B2, limpeza do temporário; **falha se banco ou baldes de origem vierem vazios**; credenciais por arquivo de ambiente, nunca `-e CHAVE=` (FR-015)
- [X] T052 [P] [US3] Teste `ops/backup-externo.test.sh` com SeaweedFS de teste e destino S3 simulado: caso feliz, origem vazia (deve falhar), arquivo enviado com SHA-256 diferente do manifesto (deve falhar), nenhuma chave em `ps` nem em `docker inspect`
- [x] T053 [US3] Completar `ops/restaurar-teste.sh` (base da T012): baixar o mais recente com a chave de leitura, conferir SHA-256 e manifesto, descriptografar com a chave de teste, restaurar o banco em contêiner descartável em rede isolada, restaurar os arquivos em baldes de teste, comparar contagens do manifesto e registrar o resultado; sair com erro em qualquer divergência
- [ ] T054 [DONO] [US3] Gerar a chave `age` de teste na VPS `[VPS]` (privada em `/root/.plugga-restauracao.key`, modo 600; pública em `ops/backup/age-recipients.txt`) e conferir que a privada do dono não está na VPS
- [ ] T055 [VPS] [US3] Capturar o estado atual de `/root/backup-plugga.sh`, do cron `/etc/cron.d/plugga-backup` e da configuração do Caddy, sem alterar nada; salvar cópias em `ops/backup-plugga.sh` (comparar com o do repositório), `ops/cron/plugga-backup` e `ops/caddy/Caddyfile` (sem segredo)
- [x] T056 [P] [US3] Criar `ops/instala-agendamentos.sh` (idempotente) que instala cron e Caddyfile versionados, guardando o anterior como `.bak-AAAAMMDD`, e `ops/instala-agendamentos.test.sh`
- [ ] T057 [VPS] [US3] Instalar `ops/backup-plugga.sh` versionado em `/opt/plugga-os/ops/` e alterar `ops/deploy.sh` para chamá-lo no lugar de `/root/backup-plugga.sh`; rodar um backup manual e confirmar dump legível (FR-014)
- [ ] T058 [VPS] [US3] Rodar `ops/instala-agendamentos.sh`; `diff` entre o instalado e o versionado deve ser vazio
- [ ] T059 [VPS] [US3] Agendar o backup externo diário às 03:10 UTC e a restauração de teste semanal; observar o primeiro ciclo completo
- [ ] T060 [US3] Configurar a retenção no B2: "Object Lock de 35 dias", regra de expiração em `diario/` e prefixo `mensal/` retido por 12 meses; tentativa de apagar com a chave de escrita deve falhar (registrar o resultado em `ops/GUIA.md`)
- [x] T061 [P] [US3] Ligar os heartbeats: ping de sucesso ao fim de `backup-externo.sh` e `restaurar-teste.sh`, ping de falha em erro; prazo esperado de 26 h (diário) e 8 dias (semanal), URLs em arquivo de ambiente da VPS
- [ ] T062 [P] [US3] Configurar o monitor HTTP externo do site (T005) e documentar quem recebe o alerta
- [ ] T063 [US3] Provocar falha de propósito (parar o backup em ambiente de teste) e confirmar que o alerta chega por e-mail em até 1 h do prazo (SC-005)
- [ ] T064 [US3] Escrever o passo a passo de recuperação de desastre em `ops/GUIA.md` (seção "Recuperação de desastre") conforme [contracts/backup-formato.md](contracts/backup-formato.md), ensaiar com a chave privada do dono em máquina limpa, cronometrar e registrar o tempo (meta ≤ 4 h, perda ≤ 24 h; FR-016, SC-003, SC-004)

**Checkpoint**: SC-003, SC-004, SC-005 verificados.

---

## Phase 6: US5 Toda rota é fechada por padrão (P1) [F1: inventário em aviso]

**Meta**: rota sem declaração explícita de acesso não fica aberta; começa em aviso e passa a negar.

**Teste independente**: um teste lista todas as rotas e falha se alguma não declarar `@Public`, `@Authenticated` ou `@Roles`; uma rota nova sem marcador é negada.

- [X] T065 [P] [US5] Criar os marcadores `@Public()` e `@Authenticated()` em `apps/api/src/core/auth/access.decorators.ts` ao lado de `roles.decorator.ts`
- [X] T066 [P] [US5] Escrever o teste de inventário em `apps/api/test/inventario-rotas.e2e.spec.ts`: sobe o app, usa `DiscoveryService` e `Reflector` para listar método, caminho (com prefixo global), `Controller.handler`, `acesso`, `papeis`, `guards`, gera `specs/002-fundacao-solida/contracts/inventario-rotas.json` e compara com o versionado
- [X] T067 [US5] Gerar o inventário atual (130 rotas em 19 controllers) e marcar quais estão `undeclared`; entregar ao dono a lista de rotas candidatas a `public` (saúde, login, convite, redefinição, Google) para aprovação em `specs/002-fundacao-solida/contracts/inventario-rotas.md`
- [X] T068 [DONO] [US5] Aprovar a lista de rotas públicas
- [X] T069 [US5] Criar o guard global em modo aviso em `apps/api/src/core/auth/rota-fechada.guard.ts`, controlado por `ROUTE_GUARD_MODE=warn|enforce` (padrão `warn`), que registra em log toda rota sem marcador, sem negar; registrar como `APP_GUARD` em `apps/api/src/core/core.module.ts`; incluir a variável em `apps/api/src/config/environment.ts` e `.env.example`
- [X] T070 [US5] Confirmar nos logs de uma execução local que só as rotas esperadas aparecem como `undeclared` (cobertura do inventário)

**Checkpoint (Fatia 1 completa)**: SC-001 a SC-005 e inventário aprovado; a imposição é a Phase 6c, da Fatia 2.
---

# FATIA 2: correções de código sem migração

## Phase 6b: Pré-requisito da Fatia 2 (sem história)

**Propósito**: coluna que o `AuditAppender` precisa a partir da Fatia 2.

- [ ] T071 [VPS] Migração aditiva mínima `apps/api/prisma/migrations/<data>_event_log_empresa/`: `event_log.company_id TEXT NULL` (sem `NOT NULL` e sem FK ainda) e índices `(company_id, occurred_at)` e `actor_id`, com `rollback.sql`; aplicar com backup restaurado antes (T012); necessária ao `AuditAppender` (T016) a partir da Fatia 2

---

## Phase 6c: US5 [F2] Imposição das rotas fechadas (P1)

**Meta**: depois do inventário aprovado (T068), rota sem declaração passa a ser negada.

- [ ] T072 [P] [US5] Renomear `DevAuthGuard` para `SessionAuthGuard` (arquivo `apps/api/src/core/auth/session-auth.guard.ts`), atualizar todos os `@UseGuards(...)` e testes, mantendo comportamento; o atalho de desenvolvimento continua em `dev-header-auth-context.ts`
- [ ] T073 [US5] Aplicar `@Public()` às rotas aprovadas e `@Authenticated()` ou `@Roles()` às demais, controller por controller, em PRs pequenos agrupados por módulo, atualizando o inventário a cada PR
- [ ] T074 [US5] Alterar `RolesGuard` em `apps/api/src/core/auth/roles.guard.ts` para **negar** quando não houver `@Public`, `@Authenticated` nem `@Roles` (fail-closed) e ajustar `apps/api/src/core/auth/permissions.guard.spec.ts`; passar `ROUTE_GUARD_MODE` padrão para `enforce` depois da fatia
- [ ] T075 [P] [US5] Adicionar `@Roles(...)` a `GET /email/status` em `apps/api/src/email/email-status.controller.ts` e `ParseUUIDPipe` aos parâmetros `:id` de `apps/api/src/auth/team.controller.ts` e demais rotas com `:id` listadas no inventário
- [ ] T076 [P] [US5] Testes em `apps/api/test/rota-fechada.e2e.spec.ts`: rota de teste sem marcador é negada; toda rota com `:id` recusa valor que não é UUID com `REQUISICAO_INVALIDA`; sem `undeclared` no inventário
- [ ] T077 [US5] Garantir que o atalho de desenvolvimento só é registrado em ambiente local ou de teste (`apps/api/src/core/auth/composite-auth-context.ts`, `apps/api/src/config/environment.ts`) e emite aviso na inicialização; teste em `apps/api/test/dev-auth-producao.e2e.spec.ts` com `NODE_ENV=production` (FR-023)
- [ ] T078 [US5] Marcar `CODEOWNERS` sobre `inventario-rotas.json` e documentar em `docs/AGENT.md` o fluxo "rota nova exige marcador e atualização do inventário"

**Checkpoint**: SC-007 verificado (nenhuma rota `undeclared`).

---

## Phase 7: US6 Integrações externas obedecem ao modo declarado (P1)

**Meta**: nenhuma chamada de rede para serviço externo ocorre se o modo da integração não a permitir.

**Teste independente**: com cada integração em `mock`, acionar e conferir que nenhuma chamada de rede sai e o resultado é simulado e auditado.

- [ ] T079 [P] [US6] Criar `IntegrationGate` com `assertMode(chave, modoMinimo)` em `apps/api/src/integrations/integration-gate.ts` lendo `integrations.mode`; erro de domínio `LimiteExcedido`/`ModoNaoPermitido` quando o modo não permitir; exportar em `integrations.module.ts`
- [ ] T080 [P] [US6] Testes do gate em `apps/api/src/integrations/integration-gate.spec.ts` para os modos `mock`, `read_only`, `bridge`, `write`
- [ ] T081 [US6] Exigir o gate em `apps/api/src/llm/openrouter.gateway.ts`: em `mock` devolve resultado simulado identificado e **não faz** chamada de rede; consumidores em `apps/api/src/energy-efficiency/fatura/fatura.service.ts` mostram ao usuário que o resultado é simulado
- [ ] T082 [P] [US6] Teste em `apps/api/test/llm-mock.e2e.spec.ts` que intercepta a rede e comprova 0 chamadas externas com a integração em `mock`
- [ ] T083 [US6] Registrar a decisão sobre e-mail (Brevo) e armazenamento S3 ficarem fora do modelo de modo em um novo ADR `docs/adr/0014-integracoes-fora-do-modelo-de-modo.md` (exceção do ADR-0010 para e-mail, S3 como infraestrutura própria) e indexar em `docs/adr/README.md`
- [ ] T084 [US6] Auditar a troca de modo de integração com o evento `integrations.mode.changed` (autor e horário) em `apps/api/src/integrations/integrations.service.ts` usando o `AuditAppender`
- [ ] T085 [P] [US6] Verificação estática em `scripts/verifica-rede-externa.mjs`: falha se um adaptador sob `apps/api/src/**` importar cliente HTTP externo sem passar pelo gate (lista de exceções documentada no ADR da T083); ligar ao lint do API

**Checkpoint**: SC-008 verificado.

---

## Phase 8: US7 Operações críticas atômicas, seguras sob concorrência e auditadas (P2)

**Meta**: aprovar, assinar, revogar, ganhar, numerar e alterar acesso nunca deixam estado parcial, nunca sobrescrevem decisão concorrente e sempre geram um evento.

**Teste independente**: para cada operação, duas execuções simultâneas e uma falha no meio; exatamente uma vence, nada fica parcial, há um evento por efeito.

- [ ] T086 [P] [US7] Criar o auxiliar de concorrência em `apps/api/src/common/concorrencia.ts` com `transicionar(tx, modelo, id, deEstado, dados)` baseado em `updateMany({ where: { id, status: deEstado } })` que lança `Conflito` se `count === 0`, e `comRepeticaoP2002(fn, n=3)`
- [ ] T087 [US7] Estudo de eficiência energética em `apps/api/src/energy-efficiency/prisma-estudo.repository.ts` e `estudo.service.ts`: `aprovar` e envio em uma só `$transaction` com `transicionar` condicionado ao status de origem e à coluna `version`, evento `energy_efficiency.study.approved` e `energy_efficiency.study.sent` pelo `AuditAppender`
- [ ] T088 [P] [US7] Testes em `apps/api/test/atomicidade-estudo.integration.spec.ts` (banco real): duas aprovações simultâneas (uma vence, a outra recebe `CONFLITO_ESTADO`), falha entre as duas escritas (nada fica parcial), um evento por efeito
- [ ] T089 [US7] Obras em `apps/api/src/obras/prisma-obras.repository.ts`: `assinarApr`, `conferirEpi`, `revogarLiberacao`, `registrarLiberacao`, `registrarPendencia`, `lancarMedicao` e `criarVersaoDeProjeto` passam a `transicionar` condicionado (`WHERE segurancaAssinouEm IS NULL`, `revogadoEm IS NULL`) dentro de `$transaction` com evento (`obras.apr.signed`, `obras.epi.checked`, `obras.release.recorded`, `obras.release.revoked`, `obras.pendency.recorded`, `obras.measurement.recorded`, `obras.project_version.created`); `criarVersaoDeProjeto` repete em `P2002` de `versao+1`
- [ ] T090 [P] [US7] Testes em `apps/api/test/atomicidade-obras.integration.spec.ts`: assinar APR duas vezes preserva a primeira assinatura e recusa a segunda; duas revogações simultâneas, uma vence; duas versões simultâneas geram versões distintas
- [ ] T091 [US7] Comercial em `apps/api/src/commercial/prisma-commercial.repository.ts`: `winOpportunity` cria o cliente **dentro** da mesma transação que marca a oportunidade como ganha (nenhum cliente órfão se a segunda parte falhar), com eventos `commercial.opportunity.won` e `clientes.client.created`
- [ ] T092 [P] [US7] Teste `apps/api/test/atomicidade-comercial.integration.spec.ts`: falha na marcação como ganha não deixa cliente criado
- [ ] T093 [US7] Compras em `apps/api/src/compras/prisma-compras.repository.ts`: numeração de pedido por empresa com `comRepeticaoP2002`, sem erro ao usuário em disputa; `compras.pedido.created` pelo `AuditAppender`
- [ ] T094 [P] [US7] Teste `apps/api/test/numeracao-pedido.integration.spec.ts`: dois pedidos simultâneos na mesma empresa recebem números distintos e ambos são criados
- [ ] T095 [US7] Pluggamob em `apps/api/src/pluggamob/prisma-pluggamob.repository.ts`: `requestApproval` e `approve` com `transicionar` condicionado ao status de origem; evento `pluggamob.settlement.approved`; teste `apps/api/test/atomicidade-pluggamob.integration.spec.ts` (um `approved` nunca volta a `ready_for_review`)
- [ ] T096 [US7] Último administrador em `apps/api/src/auth/team.service.ts` e `apps/api/src/auth/prisma-auth.repository.ts`: checagem e escrita na mesma transação com `SELECT ... FOR UPDATE` sobre os papéis de plataforma e recontagem condicional; eventos `auth.access.changed` e `auth.user.deactivated` na mesma transação; espelhar a regra em `apps/api/test/support/in-memory-auth.ts`
- [ ] T097 [P] [US7] Teste `apps/api/test/ultimo-admin.integration.spec.ts`: com exatamente dois administradores, dois rebaixamentos simultâneos deixam pelo menos um (FR-029)
- [ ] T098 [US7] Padronizar as respostas de conflito de corrida de 400 para 409 `CONFLITO_ESTADO` e as mensagens em português (hoje há `"cycle not found"` e `"user not found"` com 400), usando os erros de domínio da T019; atualizar os e2e afetados
- [ ] T099 [US7] Remover `HttpException` de `apps/api/src/energy/prisma-energy.repository.ts` (32 ocorrências), movendo a decisão para `energy.service.ts` com erros de domínio; e2e do módulo verdes
- [ ] T100 [US7] Remover `HttpException` de `apps/api/src/commercial/prisma-commercial.repository.ts` (25 ocorrências), movendo a decisão para o service; e2e do módulo verdes
- [ ] T101 [US7] Remover `HttpException` de `apps/api/src/obras/prisma-obras.repository.ts` (14 ocorrências), movendo a decisão para o service; e2e do módulo verdes
- [ ] T102 [US7] Remover `HttpException` de `apps/api/src/compras/prisma-compras.repository.ts` (13 ocorrências), movendo a decisão para o service; e2e do módulo verdes
- [ ] T103 [P] [US7] Verificação estática em `scripts/verifica-sem-http-em-repositorio.mjs`: falha se um arquivo `*repository*` importar de `@nestjs/common` exceções HTTP; ligar ao lint do API

**Checkpoint**: SC-009 e SC-010 verificados (execuções concorrentes, 409).

---

## Phase 9: US10 Entradas pesadas não derrubam o sistema (P2)

**Meta**: arquivo malformado ou gigante é recusado em segundos, com mensagem clara, sem afetar os demais.

**Teste independente**: PDF de mil páginas, página gigante, imagem enorme e executável renomeado são recusados em < 3 s sem aumento relevante de memória.

- [ ] T104 [P] [US10] Criar `apps/api/src/common/upload/inspeciona-arquivo.ts` que valida por **bytes mágicos** (PDF, PNG, JPEG, TIFF, XLSX) e lê a contagem de páginas e as dimensões do cabeçalho **sem extrair texto**; limites: no máximo 3 páginas para fatura, dimensão máxima 4.000 × 4.000 pixels após a escala de 200 DPI, mensagens de erro `TIPO_NAO_PERMITIDO`/`ARQUIVO_RECUSADO`
- [ ] T105 [P] [US10] Testes `apps/api/src/common/upload/inspeciona-arquivo.spec.ts` com arquivos gerados no teste (PDF com 1.000 páginas, página 14.400 pt, PNG de bilhões de pixels, executável com nome `.pdf`)
- [ ] T106 [US10] Aplicar a inspeção **antes** de qualquer extração em `apps/api/src/energy-efficiency/fatura/paginas.ts` (extração só até o teto, rasterização só após checar dimensão), `documento.ts` e `fatura.controller.ts`; tempo máximo de **60 s** de leitura e **90 s** de OCR, com cancelamento, em `apps/api/src/energy-efficiency/fatura/ocr.ts`
- [ ] T107 [US10] Trocar o `multer` por armazenamento em disco temporário em `apps/api/src/energy-efficiency/fatura/fatura.controller.ts`, `apps/api/src/compras/compras.controller.ts` e `apps/api/src/obras/obras.controller.ts` com limite de **25 MB por arquivo e 60 MB por requisição**, **no máximo 8 uploads em andamento no total** (o excedente recebe 503 `SERVICO_INDISPONIVEL` com "tente novamente") e 2 por usuário; limpar o temporário ao fim; resposta `ARQUIVO_GRANDE_DEMAIS` (413) quando exceder (hoje Compras aceita 20 arquivos × 20 MB em memória)
- [ ] T108 [US10] Conferir tipo por conteúdo (`inspeciona-arquivo`) nos envios de Compras (cotações) e Obras (evidências) em `apps/api/src/compras/armazenamento-de-cotacoes.ts` e `apps/api/src/obras/armazenamento-de-evidencias.ts`
- [ ] T109 [US10] Tratar falhas do armazenamento sem vazar detalhe interno: substituir `` `não foi possível guardar o orçamento anexado: ${erro.message}` `` e equivalentes por `SERVICO_INDISPONIVEL` com mensagem genérica; registrar o detalhe só no log com `requestId`
- [ ] T110 [P] [US10] Teste e2e `apps/api/test/limites-entrada.e2e.spec.ts`: cada arquivo hostil é recusado em menos de 3 segundos e a memória do processo não sobe mais de 100 MB; uma requisição legítima simultânea continua respondendo (SC-012)

**Checkpoint**: SC-012 verificado.

---

## Phase 10: US11 Login resistente a abuso e sessões revogáveis (P2)

**Meta**: ninguém de fora trava logins alheios nem a conta de outra pessoa; redefinição derruba sessões na hora; segredo de exemplo não sobe em produção.

**Teste independente**: tentativas falhas contra uma conta não impedem outras contas nem a própria com a senha certa; reset derruba sessão antiga; produção recusa segredo de exemplo.

- [ ] T111 [US11] Confirmar com o resultado da T008(b) a configuração real de proxy em produção e, se faltar, preparar o ajuste do `compose.yaml` e do Caddy (`TRUST_PROXY`, `WEB_TRUST_PROXY`) conforme ADR-0012, para aplicar com aprovação `[VPS]`
- [ ] T112 [US11] Mover os limitadores de tentativa de `apps/api/src/auth/email-attempt-limiter.service.ts` e do throttler para Redis (SEC-006), por origem real do cliente **e** por conta; trocar a recusa por **atraso progressivo** para quem erra, nunca recusar quem informa a senha correta (`apps/api/src/auth/auth.service.ts`)
- [ ] T113 [P] [US11] Teste `apps/api/test/login-abuso.e2e.spec.ts`: 30 falhas contra a conta A não impedem a conta B de entrar; a conta A ainda entra com a senha certa; os contadores sobrevivem a reinício do app
- [ ] T114 [US11] Chamar `sessions.revokeAllForUser` na redefinição de senha em `apps/api/src/auth/auth.service.ts` (`confirmReset`) e `prisma-auth.repository.ts`; teste `apps/api/test/reset-sessao.e2e.spec.ts`: a sessão antiga é recusada em menos de 5 segundos (SC-014)
- [ ] T115 [US11] Exigir senha no Redis (`requirepass`/ACL) em `compose.yaml` e `apps/api/src/config/environment.ts` e autenticar as entradas do cache de sessão com HMAC em `apps/api/src/core/auth/redis-session-cache.ts`; teste de entrada adulterada recusada `[VPS]` ao ativar
- [ ] T116 [P] [US11] Lista permitida de domínios do Google: variável `GOOGLE_ALLOWED_HD` em `apps/api/src/config/environment.ts` e verificação de que o `hd` coincide com o domínio do e-mail em `apps/api/src/auth/google-auth.service.ts`; testes em `apps/api/src/auth/google-auth.service.spec.ts`
- [ ] T117 [US11] Redefinição de senha com resposta e tempo indistinguíveis entre conta existente e inexistente: enviar o e-mail por fila BullMQ em `apps/api/src/auth/auth.service.ts` e `apps/api/src/jobs/queue/`; teste de tempo em `apps/api/test/reset-tempo.e2e.spec.ts`
- [ ] T118 [US11] Recusar na inicialização, em produção, segredo igual ao de exemplo, vazio ou de baixa entropia (`SECRETS_ENCRYPTION_KEY` toda zero, `AUTH_SESSION_SECRET` de exemplo) em `apps/api/src/config/environment.ts` e `apps/api/src/llm/cripto.ts`; teste `apps/api/test/segredos-producao.spec.ts` sobe em modo produção com cada valor de exemplo e espera recusa
- [ ] T119 [US11] Repassar `Origin` do web para a API e exigir `OriginCheckGuard` também em `POST /agent-actions` (`apps/api/src/audit/agent-actions.controller.ts`), e recusar mutação sem `Origin` quando autenticada por cookie (`apps/api/src/core/auth/origin-check.guard.ts`, `apps/web/app/lib/api-proxy.ts`)

**Checkpoint**: SC-013, SC-014, SC-015 verificados.

---

## Phase 11: US12 O frontend fala com a API de forma única, segura e honesta (P2)

**Meta**: identificador da URL validado antes de chegar à API; erro real aparece como erro; telas sem backend avisam que são exemplo.

**Teste independente**: identificadores como `../..` e `%2F` são recusados no frontend; derrubar a API mostra mensagens distintas; Dashboard e Pendências mostram o aviso.

- [ ] T120 [P] [US12] Criar o cliente único de API do servidor em `apps/web/app/lib/api-client.ts` (`import "server-only"`): tempo máximo único, repasse do cookie, de `X-Forwarded-For` (conforme `forwarded-for.ts`) e de `Origin`, codificação de parâmetros com `encodeURIComponent` e `URLSearchParams`, validação da resposta com zod de `packages/shared`, erros tipados `naoAutenticado | proibido | naoEncontrado | indisponivel` e leitura do envelope da T013
- [ ] T121 [P] [US12] Testes `apps/web/test/api-client.test.ts`: identificador malformado é recusado sem chamada, parâmetros são codificados, cada status vira o erro tipado certo
- [ ] T122 [US12] Tipar e validar o **corpo de requisição** com os schemas de `packages/shared` em vez de `corpo: unknown` (`apps/web/app/lib/compras-client.ts` e demais clientes de `apps/web/app/lib/`), validando antes do envio; teste em `apps/web/test/requisicoes.test.ts` (FR-060)
- [ ] T123 [US12] Validar identificadores como UUID (schema de `@plugga/shared`) nos proxies e server actions: `apps/web/app/api/energia/estudos/[id]/documento/route.ts`, `api/energy/cycles/[id]/close/route.ts`, `api/clientes/[id]/route.ts`, `api/compras/pedidos/[id]/*`, `energia-opm/eficiencia/actions.ts` (linhas 143, 238, 244, 250) e `apps/web/app/lib/api.ts`; recusar com 400 antes de chamar a API
- [ ] T124 [US12] Substituir os cinco proxies duplicados (`api-proxy.ts`, `auth-proxy.ts`, `energy-proxy.ts`, `commercial-proxy.ts`, `compras-proxy.ts`) por um proxy genérico sobre o cliente da T120, preservando as rotas; remover a cópia de `isOriginAllowed` em `apps/web/app/api/llm/chave/route.ts` usando `lib/origin-check.ts`; as server actions passam a repassar `X-Forwarded-For`
- [ ] T125 [US12] Servir `text/html` em `apps/web/app/api/energia/estudos/[id]/documento/route.ts` só quando a API declarar `content-type: text/html`; adicionar tempo máximo à chamada
- [ ] T126 [US12] Trocar o `?? FALLBACK_*` silencioso: as páginas (`apps/web/app/compras/page.tsx`, `energia-opm/ciclos/page.tsx`, `comercial/contratos/page.tsx`, `jobs`, `integracoes`, `migracoes/[id]/page.tsx`) usam o erro tipado e mostram tela distinta para não autorizado, proibido, não encontrado e indisponível; dado de exemplo só com `NEXT_PUBLIC_ALLOW_SAMPLE_DATA=true` em desenvolvimento
- [ ] T127 [P] [US12] Criar `loading.tsx`, `error.tsx` e `not-found.tsx` em `apps/web/app/` (raiz) e nos módulos `compras`, `energia-opm`, `comercial`, `clientes`, `engenharia`, `pluggamob`
- [ ] T128 [US12] Renomear `NEXT_PUBLIC_API_URL` para `API_INTERNAL_URL` lida em tempo de execução em `apps/web/app/lib/env.ts` com `import "server-only"`, ajustar `apps/web/Dockerfile`, `compose.yaml` e `.env.example` para a imagem não congelar a URL no build
- [ ] T129 [P] [US12] Criar o formatador único em `apps/web/app/lib/format.ts` (BRL e datas, fuso fixo `America/Manaus`) e trocar as cerca de 12 cópias; teste `apps/web/test/format.test.ts` cobrindo virada de dia em UTC
- [ ] T130 [US12] Marcar Dashboard (`apps/web/app/components/dashboard-view.tsx`) e Central de Pendências (`pendencias-view.tsx`) com aviso visível "Dados de exemplo" e estado `parcial` em `apps/web/app/lib/organizacao.ts` (linhas 231 e 232), corrigindo o rodapé contraditório
- [ ] T131 [P] [US12] Teste e2e em `apps/web/e2e/estados-de-erro.spec.ts`: API derrubada mostra "indisponível", usuário sem papel mostra "acesso negado", registro inexistente mostra "não encontrado", Dashboard e Pendências mostram o aviso (SC-017)

**Checkpoint**: SC-016 e SC-017 verificados.

---

## Phase 12: US8 Dados pessoais protegidos e com ciclo de vida definido (P2) [F2 eventos sem PII, F3 retenção]

**Meta**: sem valores pessoais no registro imutável; retenção definida; apagamento atendível.

**Teste independente**: criar e editar cliente e fornecedor e conferir que o evento guarda só identificadores e nomes de campos; aplicar um pedido de apagamento de teste.

### [F2] Parar de gravar PII

- [ ] T132 [US8] Trocar `payload: { input, … }` (`apps/api/src/clientes/prisma-clientes.repository.ts` linhas 107 e 134, `apps/api/src/commercial/prisma-commercial.repository.ts` linha 151, `apps/api/src/compras/prisma-compras.repository.ts` linha 1022 com `documento`) por `{ campos: [...] }` pelo `AuditAppender`; formato de [data-model.md](data-model.md) §4
- [ ] T133 [P] [US8] Testes `apps/api/test/eventos-sem-pii.integration.spec.ts`: criar/editar cliente, oportunidade e fornecedor e varrer `event_log.payload` procurando nome, e-mail, telefone e documento usados no teste (deve achar 0)

### [F3] Retenção e apagamento

- [ ] T134 [DONO] [US8] Aprovar a política de retenção da tabela de [data-model.md](data-model.md) §5 (ou ajustar os prazos) e decidir o tratamento do `event_log` legado com PII: **(b, padrão)** manter com justificativa e prazo na política, sem alterar o histórico; ou **(a)** mascarar, o que só é permitido depois da emenda da constituição da tarefa T136; registrar em `docs/politica-retencao-dados.md`
- [ ] T135 [US8] Job diário que apaga sessões 30 dias após expirarem (incluindo `ip` e `user_agent`) em `apps/api/src/auth/session-cleanup.job.ts` registrado na fila BullMQ existente; teste `apps/api/test/limpeza-sessoes.integration.spec.ts`
- [ ] T136 [DONO] [US8] **Somente se (a) for escolhida na T134**: rodar `/speckit-constitution` para uma emenda MINOR do princípio IV com exceção estreita de LGPD (quem aprova, quando, o que pode ser mascarado, registro da operação), registrar o ADR `docs/adr/0015-excecao-lgpd-event-log.md` e indexá-lo em `docs/adr/README.md`; sem essa emenda a T137 não pode rodar
- [ ] T137 [VPS] [US8] **Condicional à emenda da T136** (padrão: não executar; o legado é mantido com justificativa): criar a migração de dados `apps/api/prisma/migrations/<data>_mascara_pii_event_log/` que suspende o gatilho de imutabilidade só dentro da migração, remove os valores pessoais do `payload` mantendo a linha, com `rollback.sql`; executar **na VPS** pelo caminho de `ops/deploy.sh` (nunca a partir da máquina de desenvolvimento), com backup restaurado antes (T012); registrar a execução
- [ ] T138 [US8] Escrever e ensaiar o procedimento de apagamento de titular em `ops/apagamento-titular.md` e script de leitura `ops/localiza-titular.sh` (busca por documento ou e-mail em `clients`, `fornecedores`, faturas, estudos, balde S3 e `event_log` por identificador, sem imprimir os dados); ensaio com titular sintético e conferência de que nada o identifica mais (SC-011)

**Checkpoint**: SC-011 verificado.

---

# FATIA 3: migrações aditivas

> Cada migração: backup restaurado antes (T012), `rollback.sql` ao lado, teste de subir/descer na CI (T146), publicação com aprovação `[VPS]`. Pré-requisito: T007 (ADR-0013 revisado).

## Phase 13: US4 Cada registro tem empresa e cada pessoa só alcança as empresas dadas (P1)

**Meta**: todo registro de negócio tem empresa; o escopo vale em todos os módulos pela mesma regra.

**Teste independente**: dois usuários de empresas diferentes com o mesmo papel tentam todas as operações sobre registros um do outro; todas falham com "não encontrado".

- [ ] T139 [P] [US4] Criar `AccessScope` em `packages/shared/src/auth.ts` (`{ companies, rolesByCompany, platformAdmin }`) derivado de `UserAccess`, e função `escopoDe(access)`; `flattenRoles` permanece só para navegação; testes em `packages/shared/src/auth.spec.ts`
- [ ] T140 [P] [US4] Implementar `CompanyScope` em `apps/api/src/core/auth/company-scope.ts` com `empresasDe(principal)`, `fragmentoWhere(escopo)` (`{ companyId: { in: [...] } }`) e `exigirEmpresa(registro, escopo)` (lança `NaoEncontrado`); testes em `apps/api/src/core/auth/company-scope.spec.ts`
- [ ] T141 [US4] Migração expandir: `ADD COLUMN company_id TEXT NULL` + índice `(company_id, …)` em `opportunities`, `contracts`, `consumer_units`, `cycles`, `audits`, `contestations`, `market_migrations`, `energy_efficiency_studies` (e dependentes), tabelas Pluggamob/EV (`event_log` já recebeu a coluna na T071), em `apps/api/prisma/migrations/<data>_empresa_responsavel_expandir/` com `rollback.sql`; `clients` **não** recebe a coluna (cadastro único, ADR-0013)
- [ ] T142 [US4] Criar a tabela `company_assignment_review` (campos de [data-model.md](data-model.md) §1) em migração própria com `rollback.sql`, e o script `apps/api/prisma/scripts/backfill-empresa.ts` que preenche em lotes com `plugga`, manda os duvidosos para a fila e é idempotente
- [ ] T143 [DONO] [US4] Decidir cada item da fila `company_assignment_review`; registrar as decisões em `specs/002-fundacao-solida/decisoes-empresa.md`
- [ ] T144 [VPS] [US4] Rodar o backfill **na VPS** (`docker compose run --rm --no-deps api pnpm ...` no padrão de `ops/deploy.sh`, com as variáveis de produção explícitas; nunca a partir da máquina de desenvolvimento, constituição VI) depois do backup restaurado; conferir contagens por tabela e que nenhuma linha ficou sem empresa fora da fila
- [ ] T145 [US4] Migração contrair: `ADD CONSTRAINT … FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID` e `VALIDATE`, depois `CHECK (company_id IS NOT NULL) NOT VALID`, `VALIDATE` e `SET NOT NULL`; mais restrição de que filho e pai têm a mesma empresa (contrato↔oportunidade, estudo↔unidade consumidora); com `rollback.sql`
- [ ] T146 [P] [US4] Criar `scripts/testa-migracao-rollback.mjs` (script `pnpm test:migrations:rollback`): aplica tudo do zero, aplica o `rollback.sql` da última migração e compara o esquema; ligar à CI
- [ ] T147 [P] [US9] Criar `scripts/verifica-rollback-existe.mjs` (falha na CI se uma migração nova não tiver `rollback.sql`) e `apps/api/prisma/MIGRACOES.md` com a regra expandir antes de contrair, `NOT VALID` seguido de `VALIDATE` e o limite de 100 mil linhas para índice normal; referenciar no `ops/GUIA.md` (FR-043)
- [ ] T148 [US4] Aplicar `CompanyScope` nos repositórios de Clientes (negócios), Comercial, Energia, Eficiência energética e Pluggamob (`apps/api/src/{clientes,commercial,energy,energy-efficiency,pluggamob}/prisma-*.repository.ts`): toda leitura e listagem usa `fragmentoWhere`, toda mutação usa `exigirEmpresa`, totais e indicadores contam só as empresas do escopo; registro de empresa não permitida responde `NAO_ENCONTRADO`
- [ ] T149 [US4] Substituir `ComprasEscopoRepository` e `ObrasEscopoRepository` (`apps/api/src/compras/compras-escopo.repository.ts`, `apps/api/src/obras/obras-escopo.repository.ts`) pelo `CompanyScope`, removendo a duplicação; manter os testes de Compras e Obras verdes
- [ ] T150 [US4] Alterar `RolesGuard` (`apps/api/src/core/auth/roles.guard.ts`, `packages/shared/src/auth.ts`): o guard exige o papel em **pelo menos uma empresa do escopo** da pessoa (decisão sem carregar o registro) e `flattenRoles` deixa de alimentar o guard; a decisão por registro é do service após carregar (`rolesByCompany[registro.companyId]`) e do repositório (T148: filtro de empresa na leitura, `exigirEmpresa` na escrita, empresa do corpo validada contra o escopo na criação); testes em `apps/api/src/core/auth/roles.guard.spec.ts` e na matriz da T153
- [ ] T151 [US4] Limitar a concessão em `apps/api/src/auth/team.service.ts` (linhas 334 a 343): o concedente só atribui (empresa, papel) que administra; gestor de departamento não concede papel que valha em outra empresa; evento `auth.access.changed`; testes em `apps/api/src/auth/team.service.spec.ts`
- [ ] T152 [P] [US4] Teste de equivalência `ops/confere-alcance.sh` + `apps/api/test/equivalencia-alcance.integration.spec.ts`: o alcance de cada pessoa existente (empresas e papéis) é idêntico antes e depois da migração e do novo guard (FR-023 da spec 003 e US4 cenário 6)
- [ ] T153 [P] [US4] Matriz de isolamento em `apps/api/test/isolamento-empresas.integration.spec.ts`: para cada repositório de módulo de negócio, usuários A e B com o mesmo papel em empresas diferentes tentam ler, listar, alterar e aprovar registros um do outro; todas falham com `NAO_ENCONTRADO`; admin e usuário das duas empresas veem ambas (SC-006)
- [ ] T154 [US4] Teste estático em `scripts/verifica-escopo-em-repositorio.mjs`: falha se um `prisma-*.repository.ts` de módulo de negócio consultar uma tabela com `company_id` sem usar `fragmentoWhere` ou `exigirEmpresa` (FR-019a)
- [ ] T155 [US4] Atualizar `docs/adr/0013-empresa-como-atributo-modulos-compartilhados.md` com a nota "a spec 002 não troca as tabelas de acesso" e `docs/AGENT.md` com a regra do escopo único

**Checkpoint**: SC-006 verificado; a spec 003 pode começar.

---

## Phase 14: US9 O banco impõe as regras que o código assume (P2)

**Meta**: unicidade, vínculos e estados válidos garantidos pelo banco; deriva de schema detectada na CI.

**Teste independente**: tentar direto no banco de teste inserir duplicata, vínculo entre empresas, status inválido e esvaziar tabela imutável; tudo recusado.

- [ ] T156 [US9] Script de leitura `apps/api/prisma/scripts/lista-duplicatas.ts` que lista duplicatas de cliente (documento normalizado e `lower(email)`) e de unidade consumidora (`client_id`, `code`) sem alterar nada; entregar o relatório ao dono
- [ ] T157 [DONO] [US9] Decidir cada duplicata do relatório da T156 em `specs/002-fundacao-solida/decisoes-duplicatas.md`
- [ ] T158 [US9] Migração de unicidade: índice único em `clients` por documento normalizado e por `lower(email)`, e `UNIQUE (client_id, code)` em `consumer_units`, em `apps/api/prisma/migrations/<data>_unicidade/` com `rollback.sql`; aplicar só depois da T157
- [ ] T159 [US9] Migração de vínculos: obra e fornecedor do pedido na mesma empresa do pedido (FK composta `(id, company_id)` ou gatilho) e cotação selecionada pertencente ao pedido (FK composta `(id, pedido_id)`); verificar antes que os dados atuais já são coerentes; `rollback.sql`
- [ ] T160 [US9] Migração de estados: `CHECK` de `users.status` em `('active','invited','deactivated')` (confirmar os valores existentes antes), `CHECK (competence_month BETWEEN 1 AND 12)` em `apps/api/prisma/schema.prisma` linhas 874 e 1012 e demais status em texto livre (`connectors.status`, `coupons.status`, `d14_credits.status`, `incidents.severity`); `rollback.sql`
- [ ] T161 [US9] Migração de autoria: FKs `ON DELETE RESTRICT` para `owner_id`, `created_by_id`, `approved_by_id` (`energy_efficiency_studies`), `energy_invoice_type_approvals.approved_by_id`, `pedidos_de_compra.selecionou_cotacao_id` e `aprovou_id`; checar órfãos antes e listar; `rollback.sql`
- [ ] T162 [US9] Migração de imutabilidade: `agent_actions.requested_by` e `evidencias_de_obra.obra_id` passam a `RESTRICT`, e gatilho `BEFORE TRUNCATE FOR EACH STATEMENT` em `event_log`, `agent_actions` e `evidencias_de_obra`; teste em `apps/api/test/database-append-only.spec.ts` ampliado (apagar usuário referenciado, apagar obra com evidência, `TRUNCATE`)
- [ ] T163 [P] [US9] Migração de índices nas colunas de FK listadas na auditoria (`opportunities.owner_id`, `contracts.owner_id/opportunity_id`, `cycles.owner_id`, `audits.created_by_id`, `obras.client_id`, `pedidos_de_compra.obra_id/client_id/solicitante_id`, `event_log.actor_id`, entre outras) com `rollback.sql`; tabelas abaixo de 100 mil linhas usam índice normal
- [ ] T164 [US9] Ligar `prisma migrate diff --exit-code` à CI com lista explícita de exceções para `pedidos_de_compra_etapas_uma_aberta_por_pedido` e `obra_etapas_historico_uma_aberta_por_obra` em `scripts/prisma-diff-excecoes.json` e `.github/workflows/ci.yml`
- [ ] T165 [P] [US9] Teste `apps/api/test/restricoes-banco.integration.spec.ts`: inserções inválidas direto no banco de teste (duplicata, vínculo entre empresas, status inválido, mês 13, truncate) são recusadas

---

## Phase 15: US8 (continuação) Indicadores de Compras sem corte silencioso (P2)

- [ ] T166 [US7] Em `apps/api/src/compras/prisma-compras.repository.ts` (linhas 885 a 952) levar `de` e `ate` para o `where` e remover o `take: 5000`; se o resultado for parcial, devolver aviso explícito (FR-033); teste `apps/api/test/indicadores-compras.integration.spec.ts` com mais de 5.000 pedidos

---

# FATIA 4: sustentação

## Phase 16: US13 Publicação reversível e sistema observável (P3)

**Meta**: publicar com versões identificáveis, reverter com segurança, saber a saúde real e ser avisado.

**Teste independente**: publicar versão que falha na prontidão e conferir a volta automática; derrubar o banco de teste e ver a prontidão refletir; provocar erro e vê-lo no rastreador com `requestId`.

- [ ] T167 [US13] Criar `GET /health/ready` em `apps/api/src/health/health.controller.ts` (`SELECT 1`, `PING` do Redis, `HeadBucket` do armazenamento, com tempo máximo por verificação), restrito à rede interna, e manter `GET /health` como liveness; teste `apps/api/test/health-ready.e2e.spec.ts` com cada dependência indisponível (SC-019)
- [ ] T168 [US13] `ops/deploy.sh`: tagear imagens por SHA do commit (`plugga-os-api:<sha>`), manter as últimas 5, trocar `sleep 15` por repetição até a prontidão (limite 5 min), voltar automaticamente se não ficar pronto, e **não** marcar `latest` antes da migração e da prontidão (FR-061)
- [ ] T169 [US13] Deploy por SSH com comando forçado: criar `ops/deploy-entrada.sh` (único comando permitido, valida o SHA aprovado), `authorized_keys` com `command="/opt/plugga-os/ops/deploy-entrada.sh",no-pty,no-port-forwarding,no-agent-forwarding` e alterar `deploy.yml` para usar runner hospedado do GitHub com a chave guardada no ambiente `production` `[VPS]`
- [ ] T170 [VPS] [US13] Remover o runner self-hosted e o `sudo` sem senha da VPS depois de uma publicação por SSH bem-sucedida, mantendo `publicar.sh` como caminho de emergência; o job `corpus` sai do `ci.yml` e passa a ser `ops/corpus-semanal.sh` agendado na VPS (contêiner descartável sem privilégios, chave só de leitura, resultado por heartbeat), decisão a confirmar com o dono (alternativa: runner containerizado sem `sudo`)
- [ ] T171 [P] [US13] Registro estruturado sem perda: corrigir `apps/api/src/logging/json-logger.service.ts` (linhas 39 a 45) para preservar pilha e todos os parâmetros, incluir `requestId` e criar registro de acesso por requisição sem corpo nem cookies; teste `apps/api/src/logging/json-logger.service.spec.ts`
- [ ] T172 [US13] Instalar o rastreador de erros (Sentry) em `apps/api/src/main.ts` e `apps/web` com `sendDefaultPii: false`, sem corpo de requisição e `beforeSend` que remove cabeçalhos, cookies, e-mails, documentos e valores; `requestId` como tag; avisar o responsável; teste que simula erro com PII e confere o evento enviado
- [ ] T173 [P] [US13] Limites de memória e CPU, rotação de logs (`logging: { driver: json-file, options: { max-size, max-file } }`) e `healthcheck` do `web` em `compose.yaml`; verificar a folga de memória da VPS antes `[VPS]`
- [ ] T174 [P] [US13] Imagem enxuta da API em `apps/api/Dockerfile`: estágio de runtime só com dependências de produção (`pnpm deploy --prod`), Prisma CLI só no estágio de migração, `curl` removido, `TESSERACT_DATA_PATH` com checksum do `traineddata`; build e teste `docker build --target runtime`
- [ ] T175 [US13] Teste de publicação com falha de prontidão em ambiente de teste: reverte sozinha em até 5 minutos e as últimas 5 versões ficam disponíveis (SC-018); registrar em `ops/GUIA.md`

---

## Phase 17: US14 Esteira de qualidade que protege (P3)

**Meta**: a CI roda tudo o que o projeto tem e promete, rápida e estável.

**Teste independente**: introduzir regressão de propósito em cada área e ver a CI falhar; medir o tempo.

- [ ] T176 [US14] Reorganizar `.github/workflows/ci.yml` em jobs paralelos (qualidade, banco, e2e, imagens, ops) com cache de pnpm e do navegador do Playwright e `fetch-depth: 0` para o scanner; meta de 15 minutos
- [ ] T177 [P] [US14] Incluir na CI as suítes hoje ausentes: `test:compras`, `test:storage`, `test:ocr`, `test:llm`, integração de energia (`energy-foundation.integration.spec.ts`, `estudo-fluxo.integration.spec.ts` com `RUN_DATABASE_INTEGRATION_TESTS`), `test:platform-safety`, `test:migrations:from-zero`, `ops/*.test.sh` e o oráculo (`RUN_ORACULO_TESTS` com Python), usando o SeaweedFS de `compose.test.yaml`
- [ ] T178 [P] [US14] `shellcheck` sobre `ops/*.sh` e `scripts/*.sh` na CI, corrigindo os alertas
- [ ] T179 [P] [US14] Build das imagens Docker na CI (`docker build --target runtime` para API e web) sem publicar
- [ ] T180 [P] [US14] Cobertura mínima de **70% de linhas** nos módulos críticos (auth, compras, obras, comercial, energia, energy-efficiency) em `apps/api/vitest.config.ts`, com falha abaixo do limite e ajuste só por ADR
- [ ] T181 [P] [US14] Pinar por SHA/digest as actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`), a imagem do gitleaks e as imagens base (`node`, `postgres`, `redis`) em `.github/workflows/*.yml`, `apps/*/Dockerfile`, `compose.yaml`
- [ ] T182 [P] [US14] Criar `renovate.json` (ou `.github/dependabot.yml`) com agrupamento e revisão obrigatória para atualizações de segurança
- [ ] T183 [P] [US14] Typecheck dos testes da API: `apps/api/tsconfig.test.json` incluindo `test/**` e rodá-lo em `pnpm typecheck`
- [ ] T184 [US14] Endurecer o lint em `packages/config/eslint/index.mjs`: regras com informação de tipos (`no-floating-promises`, `no-misused-promises`), `react-hooks`, `@next/eslint-plugin-next`, `jsx-a11y`; corrigir os achados; trocar as regras de fronteira por regex por resolução de módulos e testar os limites web↔api em `packages/config/eslint/index.test.mjs`
- [ ] T185 [P] [US14] Playwright: reportar testes que só passaram na retentativa como instáveis (`apps/web/playwright.config.ts`) e remover `fullyParallel` sobre banco compartilhado ou isolar os dados
- [ ] T186 [US14] Corrigir a documentação da CI: `ops/GUIA.md` linha 86 afirma que lint+typecheck+test é o que a CI roda; descrever o que realmente roda

---

## Phase 18: US15 Repositórios de dados testados contra o banco de verdade (P3)

**Meta**: lógica de persistência (concorrência, eventos, prazos) testada com o banco real.

**Teste independente**: rodar a suíte de integração e ver as regras de concorrência, unicidade e auditoria exercitadas.

- [ ] T187 [P] [US15] Testes de integração com Postgres para `apps/api/src/energy/prisma-energy.repository.ts` em `apps/api/test/energy-repo.integration.spec.ts` (transição válida, inválida, concorrência, evento)
- [ ] T188 [P] [US15] Idem para `apps/api/src/compras/prisma-compras.repository.ts` em `apps/api/test/compras-repo.integration.spec.ts` (inclui numeração por empresa e cálculo de SLA)
- [ ] T189 [P] [US15] Idem para `apps/api/src/obras/prisma-obras.repository.ts` em `apps/api/test/obras-repo.integration.spec.ts` (hoje só existe `obras.rules.spec.ts`)
- [ ] T190 [P] [US15] Idem para `apps/api/src/commercial/prisma-commercial.repository.ts` e `apps/api/src/pluggamob/prisma-pluggamob.repository.ts` em `apps/api/test/commercial-repo.integration.spec.ts` e `pluggamob-repo.integration.spec.ts`
- [ ] T191 [P] [US15] Teste de contrato dos dublês em memória em `apps/api/test/contrato-dobles.spec.ts`: e-mail único, validação do catálogo de papéis e numeração por empresa devem comportar-se como o banco real (`apps/api/test/support/in-memory-auth.ts`, dublê de Compras em `apps/api/test/compras.e2e.spec.ts`)
- [ ] T192 [US15] E2E com usuários de papéis restritos e de empresas diferentes e verificação de negação em `apps/web/e2e/` (acrescentar usuários em `apps/web/e2e/auth.setup.ts`), mais envio de arquivo (`setInputFiles`) de fatura, cotação e evidência

---

## Phase 19: US16 Arquitetura da API consistente e documentação verdadeira (P3)

**Meta**: cada módulo segue o mesmo desenho; a documentação diz o que o sistema é.

**Teste independente**: verificações estáticas de fronteira e leitura cruzada da documentação.

- [ ] T193 [P] [US16] Criar `core/armazenamento` com `ObjectStoragePort` e uma implementação S3 única com política de falha configurável (engolir ou lançar) em `apps/api/src/core/armazenamento/`; migrar `apps/api/src/compras/armazenamento-de-cotacoes.ts`, `apps/api/src/obras/armazenamento-de-evidencias.ts` e `apps/api/src/energy-efficiency/fatura/armazenamento.ts`; testes mantidos
- [ ] T194 [US16] Definir dono único por tabela: Compras para de gravar em `obra` (`prisma-compras.repository.ts` linha 1061) e pede a Obras por interface pública; documentar a tabela dono→módulos em `docs/adr/0002-next-nest-modular-monolith.md` (nota) ou novo ADR
- [ ] T195 [US16] Mover regra de negócio (SLA `adicionaDiasUteis/prazoDaEtapa`, regras de transição) de `prisma-compras.repository.ts` e `prisma-energy.repository.ts` para `*.rules.ts` puros e services, testáveis sem banco; o repositório só persiste
- [ ] T196 [P] [US16] Mover todas as variáveis lidas direto de `process.env` para `apps/api/src/config/environment.ts` (`SECRETS_ENCRYPTION_KEY` base64 de 32 bytes, `OPENROUTER_*`, `STORAGE_ACCESS_KEY`/`SECRET_KEY`/`REGION`, `CHROMIUM_*`, `TESSERACT_DATA_PATH`) e injetar por `ConfigService`; remover o fallback de Redis `redis://localhost:6379` de `apps/api/src/jobs/queue/jobs-worker.ts`
- [ ] T197 [P] [US16] Completar o catálogo de eventos: mover os 38 nomes literais para `packages/shared/src/events.ts`, tipar `eventLog.create`, remover os `registrarEvento` duplicados em Compras e Obras e padronizar a nomenclatura; teste de catálogo
- [ ] T198 [P] [US16] Mover os tipos e schemas do módulo LLM (`EstadoDaChave`, `ResumoDeConsumo`, entrada de chave) para `packages/shared/src/` e usar `ZodValidationPipe` em `apps/api/src/llm/chave.controller.ts` e `consumo.controller.ts`; remover o tipo duplicado em `apps/web/app/configuracoes/chave-llm-view.tsx`
- [ ] T199 [P] [US16] Renomear a porta de auditoria para `AuditPort` e trocar tipos do Prisma nas portas (`ActorType`) por tipos de domínio em `apps/api/src/audit/audit.repository.ts` e `apps/api/src/auth/auth.repository.ts`; mover `maskEmail` para `apps/api/src/common/`
- [ ] T200 [P] [US16] Mover `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts`, `fatura/congelar.ts` e `fatura/corpus.ts` para `apps/api/test/fixtures/` e `apps/api/scripts/`, ou excluí-los em `apps/api/tsconfig.build.json`; confirmar que o build de produção não os inclui
- [ ] T201 [US16] Leitura de fatura, chamada de LLM e geração de PDF viram jobs BullMQ com estado consultável (`queued`, `running`, `done`, `failed`) e idempotência por hash do arquivo: `apps/api/src/jobs/handlers/` (novos handlers), `apps/api/src/energy-efficiency/fatura/fatura.controller.ts` devolve o id do job, e a tela consulta o andamento em `apps/web/app/energia-opm/eficiencia/` (FR-046)
- [ ] T202 [US16] Reescrever `docs/AGENT.md` (Bloco A, "tudo mock") para o estado real (em produção, integrações permitidas por ADR), corrigir `ops/GUIA.md` e o ADR-0007 linhas 73 a 75 sobre jobs "mock"; leitura cruzada com o README (SC-023)

---

## Phase 20: US17 Higiene do produto entregue (P3)

**Meta**: o sistema entrega só o que usa e distribui só o que tem licença.

**Teste independente**: inventário dos recursos públicos com licença conferida; `/design-system` fechado em produção.

- [ ] T203 [P] [US17] Remover as fontes `Roobert*TRIAL*` (licença "Personal Use Only") e as não usadas de `apps/web/public/fonts/` e `docs/mockup/assets/fonts/`; conferir a licença das demais (`ArticulatCF-*`) e documentar em `apps/web/public/fonts/LICENCAS.md`; confirmar que `globals.css` não as referencia
- [ ] T204 [P] [US17] Remover o código morto `apps/web/app/components/unicorn-background.tsx` e tirar `cdn.jsdelivr.net`, `assets.unicorn.studio` e `my.spline.design` da política em `apps/web/app/lib/content-security-policy.ts`; teste do CSP
- [ ] T205 [P] [US17] Bloquear `apps/web/app/design-system/` em produção (404 quando `NODE_ENV=production`), com teste em `apps/web/test/`
- [ ] T206 [US17] Dividir os componentes acima de 600 linhas (`dashboard-view.tsx` com 1.642, `equipe-view.tsx`, `nova-fatura-view.tsx`, `estudo-detalhe-view.tsx`) extraindo `Tabs`, `Kanban` e subcomponentes, e adicionar à CI uma verificação de tamanho máximo com lista de exceções em `scripts/tamanho-componentes.json`

---

## Phase 21: Acabamento e verificação final

**Propósito**: fechar a feature com evidência.

- [ ] T207 Verificar os critérios sem tarefa própria: SC-020 (derrubar o web em ambiente de teste e confirmar o alerta em até 2 minutos), SC-021 (plantar uma regressão em cada área e confirmar que a CI falha; medir ≤ 15 min) e SC-026 (registrar que nenhuma fatia exigiu indisponibilidade planejada), com evidência em `specs/002-fundacao-solida/evidencias.md`
- [ ] T208 [P] Executar `quickstart.md` de ponta a ponta fatia por fatia e anexar a evidência (saídas e datas) em `specs/002-fundacao-solida/evidencias.md`
- [ ] T209 Verificar SC-001 a SC-026 um a um, marcando cada um com a evidência e a data em `specs/002-fundacao-solida/evidencias.md`
- [ ] T210 Verificar que nenhuma das "bases a preservar" regrediu (FR-080): sessões, Argon2id, CSP, redirect, trust proxy, validação de ambiente, travas otimistas, timestamptz e Decimal, CHECKs, papel de banco, gatilhos, gate do Bitrix, portas locais, usuário `node`
- [ ] T211 Atualizar `specs/002-fundacao-solida/checklists/requirements.md` e `specs/001-migracao-storage-seaweedfs/tasks.md` (T9: remover MinIO) com o estado final
- [ ] T212 Rodar `/speckit-converge` para apontar o que ficou por construir e fechar o PR final com o template `.github/pull_request_template.md`

---

## Dependências e ordem de execução

### Entre fases

- **Phase 1 (Setup)**: sem dependências. Itens `[DONO]` destravam as fases seguintes: T001 e T002 destravam a US1; T003 e T004 destravam a US3; T005 destrava os alertas; T006 destrava a US2; T007 destrava a Fatia 3.
- **Phase 2 (Fundação)**: depende de T002 (CODEOWNERS) apenas para T014. **Bloqueia** US6, US7, US8, US10, US12 e US16.
- **Fatia 1** (Phases 3 a 6) depende só de Setup e de partes da Fundação; as quatro histórias são independentes entre si (ordem sugerida: US1 → US2 → US3 → US5).
- **Fatia 2** (Phases 7 a 12) depende da Fundação; US5 [F2] depende do inventário aprovado (T068).
- **Fatia 3** (Phases 13 a 15) depende de T007, T012 (restauração ensaiada), T146 e da Fundação (`AuditAppender`); US4 antecede US9 (a empresa entra antes das restrições compostas).
- **Fatia 4** (Phases 16 a 20) pode começar em paralelo com a Fatia 3 nos itens que não tocam o banco (T171, T173, T174, T178 a T185, T193, T196 a T200, T203 a T206); US13 [T169, T170] só depois que a US3 estiver estável.
- **Phase 21** depende de tudo.

### Dentro de cada história

- Testes que **devem falhar antes** da correção (T027, T036, T088, T105, T113, T121, T153) são escritos primeiro.
- Contratos e auxiliares → repositórios/serviços → rotas → telas.
- Tarefas `[VPS]` só após as tarefas de código e teste da mesma história e com backup restaurado (T012).

### Barreiras e pré-condições

- **Barreira do histórico (T046 a T049):** antes, todas as outras frentes mergeiam ou pausam; depois, todos rebaseiam sobre o novo histórico. Nenhuma tarefa de outra história roda durante a janela.
- **Não regressão primeiro:** os testes T023 e T024 existem antes de qualquer fatia alterar uma área protegida; T210 só verifica o resultado final.
- **Fatia 2 começa pela T071** (coluna de empresa no `event_log`) antes de qualquer tarefa que use `AuditAppender` com escopo de empresa.
- **Rollback verificável:** T147 e T146 antes da primeira migração da Fatia 3.
- **Escopo de empresa:** T150 só depois de T148 e T153 em verde.

### Oportunidades de paralelismo

- Setup: T009, T010, T011 em paralelo.
- Fundação: T013, T014, T015, T017, T018, T019, T021, T022 em paralelo; T016 e T020 em sequência.
- Fatia 1: US1, US2, US3 e US5 [F1] podem andar em paralelo por pessoas diferentes (arquivos disjuntos); dentro da US3, T050, T052, T056, T061, T062 em paralelo.
- Fatia 2: US6, US7, US10, US11 e US12 tocam módulos diferentes e podem ser divididas; dentro da US7, os pares repositório/teste de cada módulo (T087/T088, T089/T090, T091/T092, T093/T094) são independentes.
- Fatia 4: as tarefas marcadas `[P]` das US14, US15, US16 e US17 não compartilham arquivos.

### Exemplo de execução paralela (Fatia 1, até a barreira T046)

```text
Pessoa A: T025 a T033 (US1)       Pessoa B: T034 a T049 (US2, depende de T006)
Pessoa C: T050 a T064 (US3)       Pessoa D: T065 a T070 (US5 F1)
```

---

## Estratégia de implementação

### MVP: US1 (publicação segura)

1. Fazer Phase 1 (T001 a T012) e Phase 2 no que a US1 precisa (T014).
2. Entregar a Phase 3 (T025 a T033). **Parar e validar**: SC-001, simulando PR, fork e push.
3. Este é o menor passo que remove o maior risco (publicar código não revisado com poder de administrador na produção).

### Entrega incremental

1. **Fatia 1** completa: US1 → US2 → US3 → US5 [F1]. Cada uma é publicável e reversível.
2. **Fatia 2**: cada PR por módulo; passar o guard global para `enforce` só depois do inventário aprovado.
3. **Fatia 3**: uma migração por vez, sempre com backup restaurado e `rollback.sql` testado.
4. **Fatia 4**: sustentação, com os itens independentes puxados antes quando houver capacidade.

### Regras que valem para todas as tarefas

- Nenhuma tarefa escreve, envia ou faz cutover em Bitrix, OMIE, PluggaMob, PagBank, WhatsApp, Telegram ou OpenClaw (constituição I).
- Nenhum segredo, chave ou dado de cliente é commitado; logs e relatórios não imprimem valores (constituição III).
- Todo `[VPS]` exige aprovação explícita, backup restaurado e rollback escrito (constituição VI).
- Cada PR é pequeno, cita `specs/002-fundacao-solida/` e preenche o template de PR.

---

## Resumo

- **Total**: 212 tarefas.
- Por história: US1 9, US2 16, US3 15, US4 16, US5 13, US6 7, US7 19, US8 7, US9 11, US10 7, US11 9, US12 12, US13 9, US14 11, US15 6, US16 10, US17 4, sem 31 (`sem` = Setup, Fundação, pré-requisito da Fatia 2 e Acabamento).
- 84 tarefas marcadas `[P]` (paralelizáveis); 212 de 212 no formato `- [ ] Txxx`.
