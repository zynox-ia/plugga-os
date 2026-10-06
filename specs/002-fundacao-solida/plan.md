# Plano de implementação: Fundação sólida do Plugga OS

**Branch**: `claude/funny-albattani-5tnccx` | **Data**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: `specs/002-fundacao-solida/spec.md` (aprovada pelo dono em 2026-10-05)

## Resumo

Corrigir, em quatro fatias publicáveis e reversíveis, as falhas confirmadas pela auditoria de 2026-10-05, sem trocar a stack e sem parar o sistema. A abordagem técnica é endurecer o que existe: fechar o caminho de publicação, tirar dado de cliente do git, ter backup fora da VPS com restauração testada, fazer a autorização "fechada por padrão" e por empresa com um único componente, tornar as operações críticas atômicas e auditadas, e fazer o CI cobrir tudo o que o projeto já promete.

Três achados da leitura do código moldam o plano:

1. **O modelo de acesso já é por empresa.** `user_company_roles` guarda (pessoa, empresa, papel). O defeito está em `flattenRoles` (`packages/shared/src/auth.ts`), que achata os papéis e faz `RolesGuard` ignorar a empresa. Logo, a spec 002 **não precisa substituir as tabelas de acesso**: precisa tornar o guard e os repositórios sensíveis à empresa do registro e acrescentar `company_id` aos dados. Isso reduz o risco e adianta a história 4. O ADR-0013 previa migrar tabelas de acesso; o plano propõe adiar isso para a spec 003 (que só reagrupa por área na tela). Pendência: o ARCHITECT confirmar e o ADR receber uma nota.
2. **Há 130 rotas em 19 controllers**, cada uma com seu `@UseGuards(...)` manual. "Fechada por padrão" é um guard global com marcador explícito, mais um teste de inventário; não exige reescrever os controllers de uma vez (primeiro em modo aviso).
3. **O repositório tem só 10 MiB de pacote git.** Reescrever o histórico com `git filter-repo` é barato e rápido; o custo é humano (congelar a `main`, refazer clones), não técnico.

## Technical Context

**Language/Version**: TypeScript estrito, Node 22 (`.nvmrc`), pnpm 11 + Turborepo

**Primary Dependencies**: NestJS (API), Next.js App Router (web), Prisma 6 + PostgreSQL 16, Redis + BullMQ, zod (`packages/shared`), SeaweedFS (S3), Caddy (proxy), Argon2id. Novas, todas opcionais e por fatia: `age` (criptografia de backup), `rclone` ou cliente S3 para o B2, `git-filter-repo` (uma vez), Sentry SDK (fatia 4).

**Storage**: PostgreSQL (dados e auditoria), SeaweedFS (arquivos, um balde por empresa e departamento), Backblaze B2 (cópia externa criptografada, nova).

**Testing**: Vitest (unidade e integração), Playwright (e2e), suítes `test:db`, `test:jobs`, `test:bitrix`, `test:seed` e as hoje condicionadas a flag; novos: matriz de isolamento entre empresas, inventário de rotas, teste de contrato dos dublês em memória, teste de migração e reversão.

**Target Platform**: VPS única Linux com Docker Compose (`82.29.152.21`), Caddy na frente, GitHub Actions com runner self-hosted na VPS (a ser restringido na fatia 1 e retirado da produção na fatia 4).

**Project Type**: monorepo web + API (monólito modular, ADR-0001/0002).

**Performance Goals**: não há meta nova de latência. Metas de segurança e operação estão nos critérios SC-001 a SC-026 da spec (recusa de arquivo hostil em < 3 s; sessão invalidada em < 5 s; reversão em < 5 min; CI em ≤ 15 min com cache).

**Constraints**: nenhuma indisponibilidade planejada (SC-026); migrações aditivas e compatíveis com a versão anterior; nenhuma escrita em sistemas externos de terceiros (constituição I); mudanças na VPS só com aprovação explícita, backup restaurado antes e rollback escrito (constituição VI); VPS com 2 CPUs e ~8 GB, compartilhada com outros projetos (não cabe empilhar serviços pesados).

**Scale/Scope**: 130 rotas, 19 controllers, ~30,8 mil linhas de código de API em produção, ~16 mil de web, 19 migrações, 17 histórias e 80 requisitos na spec. Poucas dezenas de usuários internos, volume de dados pequeno (dezenas de MB de arquivos, banco < 10 MB hoje).

## Constitution Check

*GATE: passa antes da pesquisa; reavaliado após o desenho (ver abaixo).*

| # | Princípio | Avaliação | Como o plano atende |
|---|---|---|---|
| I | Fronteira de produção e integrações | PASSA | Nada escreve em Bitrix, OMIE, PluggaMob, PagBank, WhatsApp, Telegram ou OpenClaw. Alertas usam e-mail do próprio serviço de monitor, nunca Telegram/WhatsApp. O B2 é destino de backup da própria empresa, não integração de negócio. O gate de modo (US6) torna o princípio verdadeiro por construção. |
| II | Limites do monorepo e do monólito | PASSA | Escopo de empresa e guards em `core/auth`; contratos novos (erro, eventos) em `packages/shared`; nenhum import cruzado novo. Regras de fronteira passam a ser verificadas por lint com resolução de módulos (FR-072). |
| III | Segredos e dados pessoais fora do repositório | PASSA, e é o foco | US2 remove dado de cliente e adiciona scanner; US8 tira PII de eventos; B2/age: chave privada fora da VPS, nenhuma chave no repositório. |
| IV | Auditoria append-only e tempo | PASSA | Operações críticas gravam evento na mesma transação (FR-028); gatilhos de imutabilidade ganham proteção contra `TRUNCATE`; datas seguem UTC e America/Manaus. |
| V | Verificação antes da entrega | PASSA | Fatia 4 faz a CI rodar tudo; cada fatia traz teste que falharia antes e passa depois. |
| VI | Operação segura e reversível | PASSA, com condições | Cada fatia tem rollback; migrações expandir/contrair; backup restaurado antes de qualquer migração na VPS; passos na VPS exigem aprovação do dono. A reescrita de histórico é a única ação irreversível (para clones) e vira etapa com congelamento e aprovação. |
| VII | Simplicidade | PASSA, com um desvio justificado | Escolhas mais simples quando há alternativa de igual efeito (age em vez de restic; guard global em vez de reescrever 19 controllers; adiar troca de tabelas de acesso). Desvios em Complexity Tracking. |

**Reavaliação pós-desenho (Fase 1)**: mantém-se PASSA. O único ponto novo é a dependência externa de terceiros (B2, monitor de uptime, rastreador de erros): cada uma está limitada a metadados ou dado criptografado e listada como pré-requisito do dono.

## Estratégia de entrega: 4 fatias

Cada fatia é um conjunto de PRs pequenos, publicável sozinho. Nenhuma depende de a seguinte existir. Ordem e dependências:

```text
Fatia 1  Publicação, dados de cliente, backup, inventário de rotas (aviso)
   │       (não toca dados nem comportamento da aplicação)
   ▼
Fatia 2  Correções de código sem migração
   │       gate de modo, atomicidade/auditoria, limites de entrada, login/segredos, frontend, PII em eventos
   ▼
Fatia 3  Migrações aditivas
   │       empresa responsável nos registros + escopo único, restrições e índices, retenção
   ▼
Fatia 4  Sustentação
           publicação reversível, observabilidade, CI completa, testes de repositório, arquitetura, higiene
```

Exceções de ordem permitidas: itens da fatia 4 que reduzem risco sem depender das anteriores (por exemplo, `permissions` e `concurrency` do workflow) são puxados para a fatia 1.

### Pré-requisitos do dono (ações que só o dono pode fazer)

| # | Ação | Necessária para | Quando |
|---|---|---|---|
| P1 | Criar a conta Backblaze B2, o bucket com Object Lock e as duas chaves de aplicação (escrita só; leitura só) | Backup externo (T003 a T060) | Antes da tarefa T003 |
| P2 | Gerar o par de chaves `age` do dono (offline) e guardar a chave privada em local seguro, com cópia | Backup criptografado | Antes de T004 |
| P3 | Nomear aprovadores de publicação (mínimo dois) e confirmar a regra de proteção da `main` | Ambiente `production` com aprovação (T026, T028) | Antes de T026 |
| P4 | Informar se o repositório é público/privado e se aceita forks | Ajustar a urgência e o texto da correção do deploy | Antes de T001 |
| P5 | Aprovar a janela e executar o congelamento da `main` para a reescrita do histórico; confirmar que não há PR em andamento | Reescrita de histórico (T047) | Fim da fatia 1 |
| P6 | Criar a conta no serviço de heartbeats e no monitor de uptime e entregar as URLs de ping | Alertas (T061, T062) | Antes de T061 |
| P7 | Fornecer (por canal seguro, nunca no repositório) a lista de nomes de clientes para o scanner, em segredo do GitHub | Scanner de dados (T037) | Antes de T037 |
| P8 | Aprovar cada passo que toca a VPS (instalar scripts de backup, agendamento, proxy, runner) | Todas as tarefas marcadas `[VPS]` | A cada passo |
| P9 | Confirmar a revisão técnica do ADR-0013 (inclui a simplificação de não trocar tabelas de acesso na 002) | Fatia 3 | Antes da fatia 3 |

## Decisões técnicas (resumo; detalhe e alternativas em [research.md](research.md))

| # | Tema | Recomendação | Alternativas |
|---|---|---|---|
| D1 | Publicação segura | Fatia 1: corrigir a condição do workflow (evento `push`, repositório oficial, `main`), ambiente `production` com aprovadores, `permissions`, `concurrency`, `timeout`, CODEOWNERS e proteção da `main`; tirar do runner de produção os jobs disparados por PR. Fatia 4: deploy por SSH com comando forçado a partir de runner hospedado, e remover o runner self-hosted da VPS | Runner dedicado em outra máquina; manter o runner atual só endurecido |
| D2 | Scanner de dados de cliente | Script próprio em Node (`scripts/scan-dados-cliente.mjs`) com validação de dígito verificador de CNPJ/CPF, padrões de unidade consumidora e lista de nomes em segredo do CI; `gitleaks` continua só para segredos | `gitleaks` com regras customizadas (sem checagem de dígito, muitos falsos positivos) |
| D3 | Backup | `age` (criptografia só com chave pública na VPS) + arquivo diário no B2 com Object Lock e expiração; teste de restauração semanal em contêiner descartável | `restic` (quando o volume passar de ~5 GB); `rclone crypt` |
| D4 | Alerta e monitor | healthchecks.io (heartbeats de backup, restauração e prontidão) + monitor HTTP externo do site, ambos com e-mail próprio | Uptime Kuma (na própria VPS, derrota o propósito); e-mail via Brevo (depende do sistema monitorado) |
| D5 | Erros | Sentry cloud, plano gratuito, com limpeza de dado pessoal (fatia 4) | GlitchTip na outra VPS; só log estruturado |
| D6 | Rota fechada por padrão | Guard global com `@Public()` explícito, `RolesGuard` que nega sem declaração, renomear `SessionAuthGuard` para `SessionAuthGuard`, inventário versionado e teste que o compara; fatia 1 em modo aviso, fatia 2 impõe | Reescrever cada controller; só teste de inventário sem guard |
| D7 | Escopo de empresa | `CompanyScope` em `core/auth` consumido por um auxiliar de repositório (`escopoDe(principal)`), mais matriz de teste de isolamento por repositório | Extensão do cliente Prisma que injeta filtro; RLS no Postgres (ADR-0003 rejeitou) |
| D8 | Migrações | Expandir antes de contrair; `NOT VALID` seguido de `VALIDATE`; `rollback.sql` por migração, testado na CI; sem `CONCURRENTLY` enquanto as tabelas forem pequenas | Ferramenta externa de migração online |
| D9 | Reescrita de histórico | `git filter-repo` em clone novo, `main` congelada, depois do merge dos PRs em andamento; pedido ao suporte do GitHub para limpar `refs/pull/*` e cache; nova varredura do histórico | `BFG`; só remover da árvore (rejeitado pelo dono) |
| D10 | Limites de upload/OCR | Contagem de páginas e dimensões antes de extrair; limite de pixels; checagem de bytes mágicos; `multer` em disco com teto total; OCR/LLM/PDF em fila BullMQ com consulta de andamento (fatia 2 limites, fatia 4 assíncrono) | Manter síncrono com limites |

## Project Structure

### Documentação desta feature

```text
specs/002-fundacao-solida/
├── spec.md
├── plan.md                  # este arquivo
├── research.md              # decisões D1 a D10, alternativas e riscos
├── data-model.md            # empresa responsável, escopo, retenção, restrições
├── quickstart.md            # verificação de cada fatia
├── contracts/
│   ├── erro-envelope.md     # envelope único de erro (FR-031)
│   ├── catalogo-eventos.md  # nomes e padrão de eventos de auditoria (FR-076)
│   ├── inventario-rotas.md  # regra e formato do inventário de rotas (FR-020, FR-021)
│   └── backup-formato.md    # formato dos arquivos de backup e manifesto (FR-011, FR-012)
├── checklists/requirements.md
└── tasks.md                 # gerado por /speckit-tasks
```

### Código-fonte (arquivos que a feature cria ou altera)

```text
.github/
├── workflows/deploy.yml            # condição, ambiente, permissões, concorrência, tempo máximo
├── workflows/ci.yml                # scanner de dados, jobs separados, cache, deriva Prisma (fatia 4)
├── workflows/restauracao-semanal.yml  # agenda a verificação (fatia 1, se hospedada) 
├── CODEOWNERS                      # novo
└── dependabot.yml | renovate.json  # novo (fatia 4)
scripts/
├── scan-dados-cliente.mjs          # novo (D2)
└── scan-dados-cliente.test.mjs
ops/
├── backup-plugga.sh                # passa a ser o executado na VPS (FR-014)
├── backup-externo.sh               # novo: arquivo, age, envio ao B2, manifesto
├── restaurar-teste.sh              # novo: restauração descartável e conferência
├── publicar.sh                     # usa a mesma trava do deploy (FR-004)
├── deploy.sh                       # trava, tags por SHA, prontidão (fatia 4)
├── instala-agendamentos.sh         # novo: instala cron e Caddyfile versionados
├── cron/plugga-backup              # novo (versionado)
└── caddy/Caddyfile                 # novo (versionado)
apps/api/src/
├── core/auth/                      # SessionAuthGuard, RolesGuard fail-closed, @Public, CompanyScope
├── common/                         # filtro global de exceções, envelope de erro, request-id
├── integrations/                   # IntegrationGate (assertMode) e portas
├── config/environment.ts           # todas as variáveis, segredos de exemplo recusados em produção
├── audit/                          # appendEvent transacional único, catálogo tipado
└── <módulos>/prisma-*.repository.ts  # escopo de empresa, transações, sem exceções HTTP
apps/api/prisma/
├── schema.prisma
└── migrations/                     # aditivas, cada uma com rollback.sql
apps/web/app/lib/                   # cliente único de API no servidor, validação de rota, formatação
packages/shared/src/                # eventos, erro, escopo de empresa, contratos do LLM
```

**Structure Decision**: sem projetos novos. Tudo cabe nos pacotes existentes; `ops/` e `scripts/` recebem os artefatos operacionais para ficarem versionados e testados.

## Detalhamento da Fatia 1 (nível de tarefa)

> Os IDs desta seção foram alinhados aos de [tasks.md](tasks.md) em 2026-10-05 (a numeração provisória `T1.x` foi substituída). Em caso de divergência, vale o `tasks.md`.

Objetivo: fechar o que permite dano externo imediato, **sem tocar dados nem o comportamento da aplicação**. Todas as tarefas `[VPS]` exigem aprovação do dono (P8) e backup restaurado antes. Siglas: `[P]` pode rodar em paralelo; `[VPS]` altera o servidor de produção.

### 1A. Publicação segura (US1)

| ID | Tarefa | Verificação | Rollback |
|---|---|---|---|
| T001 | Registrar visibilidade do repositório e se forks são permitidos (P4); documentar no GUIA | Texto no GUIA | n/a |
| T025 | Ligar proteção da `main` (PR obrigatório, CODEOWNERS, checks obrigatórios, sem push forçado) [ação do dono] | Tentativa de push direto é recusada | Desligar a regra |
| T026 | Criar o ambiente `production` com aprovadores (P3) [ação do dono] | Publicação fica "aguardando aprovação" | Remover o ambiente |
| T028 | `deploy.yml`: condição `conclusion == 'success'` **e** `event == 'push'` **e** `head_repository.full_name == github.repository` **e** `head_branch == 'main'`; `environment: production`; `permissions: contents: read`; `concurrency: deploy` sem cancelar; `timeout-minutes` | Teste com `workflow_run` simulado de PR, fork e push (script `act` ou repositório de teste) | Reverter o commit do workflow |
| T029 | `deploy.yml`: pular se `head_sha` não for a ponta atual da `main` (um deploy mais novo virá) | Caso de teste com dois SHAs | Remover o passo |
| T014 | `CODEOWNERS` cobrindo `.github/workflows/**`, `ops/**`, `compose*.yaml`, `Dockerfile`s | PR que muda workflow pede revisão do dono | Remover linhas |
| T030 | `ci.yml`: job `corpus` deixa de rodar em PR no runner da VPS (só `push` na `main` ou agenda, ou runner hospedado com chave só de leitura) | PR de teste não agenda job no runner `plugga-vps` | Reverter |
| T031 | `ops/publicar.sh` e `deploy.sh`: trava exclusiva (`flock`) compartilhada e recusa publicar se outra publicação estiver em andamento [VPS ao instalar] | Duas execuções simultâneas: a segunda recusa | Remover a trava |
| T032 | Documentar no GUIA que `publicar.sh` é caminho de emergência e exige o mesmo SHA aprovado | Revisão | n/a |

### 1B. Dados de cliente fora do repositório (US2, sem reescrever histórico ainda)

| ID | Tarefa | Verificação | Rollback |
|---|---|---|---|
| T034 | Inventariar ocorrências (CNPJ válido, CPF, unidade consumidora, nomes) em `packages/auditoria-oraculo/referencia/**`, `apps/api/src/energy-efficiency/**` e `apps/api/prisma/seed.ts`; relatório sem imprimir valores (só arquivo, linha e tipo) | Relatório com contagens | n/a |
| T035 [P] | Escrever `scripts/scan-dados-cliente.mjs`: CNPJ/CPF com dígito verificador, formatos com e sem pontuação, padrões de unidade consumidora, lista de nomes vinda de variável de ambiente, lista de permitidos para fixtures declaradas | Testes unitários com valores sintéticos | Remover o script |
| T037 | Cadastrar a lista de nomes como segredo do GitHub (P7) e ligar o scanner no `ci.yml` em modo **aviso** | Execução da CI com relatório | Desligar o passo |
| T038 | Gerador de fixtures sintéticas determinístico (`scripts/gera-fixtures-sinteticas.mjs`) e substituição dos arquivos reais em `casos/`, template e fixtures da API, mantendo formato e faixas de valores | Suítes que usam os casos continuam verdes (golden, oráculo, `energy-efficiency`) | `git revert` do PR |
| T042 | Mover os arquivos reais para o balde do corpus (`plugga-corpus-faturas`) com chave de leitura; `pnpm corpus:baixar` passa a trazê-los para teste local | Download reproduz os testes de regressão | Restaurar do balde |
| T043 | Ligar o scanner em modo **falha** no CI | PR que adiciona CNPJ real falha | Voltar a aviso |
| T044 | Remover da árvore atual `casos/*.json` reais, planilhas com nomes e o template com cliente | Scanner: 0 ocorrências | `git revert` |
| T047 | **Reescrita do histórico** (D9): congelar a `main` (P5); `git filter-repo` em clone espelho com lista de caminhos e substituições; verificar com o scanner o histórico inteiro; empurrar tudo (todas as branches e tags); pedir ao suporte do GitHub a limpeza de `refs/pull/*` e cache; todos refazem o clone; descongelar | Varredura do histórico: 0 ocorrências; `git rev-list --all` sem os blobs | Manter o espelho original, offline e criptografado, por 30 dias para reverter se algo for removido por engano |
| T045 | Atualizar `.gitignore` e o texto do GUIA/AGENT sobre onde mora dado real | Revisão | n/a |

### 1C. Backup externo (US3)

| ID | Tarefa | Verificação | Rollback |
|---|---|---|---|
| T050 | Escrever [contracts/backup-formato.md](contracts/backup-formato.md) (nomes, manifesto, retenção) | Revisão do dono | n/a |
| T003 | Dono cria conta, bucket e chaves do B2 (P1) | Chave de escrita consegue enviar e não consegue apagar | Revogar chaves |
| T051 [P] | `ops/backup-externo.sh`: `pg_dump` (formato custom), espelho dos baldes de negócio para diretório temporário, `tar` + `age` para os dois destinatários (dono offline; chave de teste da VPS), manifesto com contagens e SHA-256, envio ao B2, limpeza do temporário; `set -euo pipefail`, sem imprimir segredo (FR-015) | Teste local com MinIO/SeaweedFS de teste e B2 simulado (`mc`/`moto`); falha com origem vazia (lição do ensaio de 2026-09-24) | Remover o agendamento |
| T004 | Dono gera e guarda a chave `age` privada (P2); gravar a chave pública no repositório (`ops/backup/age-recipients.txt`) | Descriptografia com a privada | Gerar nova e recriptografar |
| T053 [P] | `ops/restaurar-teste.sh`: baixa o mais recente, confere SHA-256 e manifesto, descriptografa com a chave de teste, restaura o banco em contêiner descartável (rede isolada) e confere contagem de tabelas e de arquivos; registra resultado | Executa contra um backup de teste; falha se a contagem divergir | Remover |
| T057 [VPS] | Instalar `ops/backup-plugga.sh` versionado no lugar de `/root/backup-plugga.sh` (guardando o antigo como `.bak`), e fazer o `deploy.sh` chamar `/opt/plugga-os/ops/backup-plugga.sh` | Backup manual gera dump e arquivo externo | Restaurar o `.bak` |
| T055 [VPS] | Versionar e instalar o cron e o Caddyfile atuais (capturar o que roda hoje, sem alterar comportamento) por `ops/instala-agendamentos.sh` | `diff` entre o instalado e o versionado vazio | Reinstalar a cópia capturada |
| T059 [VPS] | Agendar o backup externo diário e a restauração semanal | Primeiro ciclo completo observado | Remover do cron |
| T060 | Retenção no B2: Object Lock 35 dias, regra de expiração e prefixo mensal retido por 12 meses | Tentativa de apagar com a chave de escrita falha | Ajustar a regra |
| T061 | Heartbeats (P6): ping de sucesso ao fim do backup e da restauração; ping de falha em erro; prazo esperado 26 h | Parar o backup de propósito: alerta chega por e-mail | Remover os pings |
| T062 | Monitor HTTP externo do site (P6) | Derrubar a web em ambiente de teste: alerta | Remover o monitor |
| T064 | Escrever `docs/` ou seção do GUIA: recuperação de desastre passo a passo, e medir o tempo em um ensaio (FR-016) | Ensaio cronometrado registrado | n/a |

### 1D. Inventário de rotas em modo aviso (US5)

| ID | Tarefa | Verificação | Rollback |
|---|---|---|---|
| T066 [P] | Teste que sobe o app e lista as 130 rotas com seus papéis/guards, gerando [inventario-rotas](contracts/inventario-rotas.md) | Teste gera o inventário e o compara com o versionado | Remover o teste |
| T067 | Marcar rotas sem declaração e públicas no inventário (revisão do dono da lista de públicas) | Lista aprovada | n/a |
| T069 | Guard global em modo **aviso**: registra em log, sem negar, toda rota sem `@Public()`/`@Roles()` | Logs mostram só as rotas esperadas | Remover o `APP_GUARD` |

**Critério de saída da fatia 1**: SC-001 (simulação de publicação), SC-002 (scanner em 0), SC-003 a SC-005 (backup, restauração, alerta) e inventário aprovado.

## Desenho das Fatias 2, 3 e 4 (nível de design)

### Fatia 2: correções de código sem migração

| Bloco | Mudança | Spec |
|---|---|---|
| Rotas fechadas | Passar o guard global de aviso para imposição; `RolesGuard` nega sem declaração; renomear `SessionAuthGuard`; `@Public()` nas rotas aprovadas; `ParseUUIDPipe` em `:id`; `GET /email/status` com papel | US5, FR-020 a FR-023 |
| Gate de modo | `IntegrationGate.assertMode(chave, modoMínimo)` em `integrations`, exigido pelos adaptadores de LLM; decisão registrada em ADR para e-mail e S3 (ficam fora do modelo de modo, com justificativa); auditoria de troca de modo | US6, FR-024 a FR-027 |
| Atomicidade e auditoria | Padrão único: `$transaction` + `updateMany` condicionado ao estado de origem + evento na mesma transação, aplicado a estudo, APR/EPI/liberação/pendência/medição/versão de projeto, vitória de oportunidade, aprovação de fechamento, último admin (com `SELECT … FOR UPDATE`), numeração de pedido com repetição em `P2002`; filtro global de exceções (409 em conflito, envelope em português) | US7, FR-028 a FR-031 |
| Limites de entrada | Contagem de páginas e dimensões antes de extrair; limite de pixels; bytes mágicos em Faturas/Compras/Obras; `multer` em disco com teto total; tempo máximo de leitura; mensagens sem detalhe interno | US10, FR-044, FR-045 |
| Login e segredos | Limitadores por origem real e por conta no Redis, atraso progressivo em vez de recusa de quem acerta; `revokeAllForUser` na redefinição; senha e HMAC no cache de sessão; `GOOGLE_ALLOWED_HD`; redefinição com resposta e tempo indistinguíveis (envio por fila); recusar segredo de exemplo em produção; DEV_AUTH exige ambiente local ou de teste; Origin repassado e checado na API | US11, FR-047 a FR-053 |
| Frontend | Cliente único de API no servidor (tempo máximo, sessão, origem, codificação, validação com zod, erros tipados); validação de identificador de rota; `text/html` só se a API declarar; `API_INTERNAL_URL` em tempo de execução com `server-only`; `loading.tsx`, `error.tsx`, `not-found.tsx`; formatação única em America/Manaus; avisos de exemplo em Dashboard e Pendências | US12, FR-054 a FR-060 |
| PII em eventos | Eventos passam a carregar só identificadores e nomes de campos; revisão dos repositórios de Clientes, Comercial e Compras | US8 (parcial), FR-034 |
| Indicadores de Compras | Filtro de período no banco, sem `take: 5000` | FR-033 |

Rollback: cada bloco é um PR independente; reverter o commit restaura o comportamento anterior; o guard global volta a modo aviso por variável de ambiente.

### Fatia 3: migrações aditivas

Ordem fixa, cada passo com backup restaurado antes (T053), `rollback.sql` e teste de subir/descer na CI:

1. **Empresa responsável** ([data-model.md](data-model.md)): `company_id` **nulo** em `clients`, `opportunities`, `contracts`, `consumer_units`, `cycles`, `audits`, `contestations`, `market_migrations`, `energy_efficiency_studies` e tabelas EV/Pluggamob; preencher em lote com `plugga` (Compras e Obras já têm); fila de decisão manual para duvidosos; `NOT VALID` seguido de `VALIDATE`; só então `NOT NULL`.
2. **Escopo único**: `CompanyScope` em `core/auth`; `flattenRoles` deixa de ser usado pelo guard; `RolesGuard` exige o papel em alguma empresa do escopo e o service confere o papel **na empresa do registro** (ver research D7); repositórios recebem o escopo; matriz de isolamento na CI; concessão limitada (FR-019). Sem trocar tabelas de acesso (ver Resumo, achado 1).
3. **Restrições e índices**: duplicatas listadas e resolvidas com o dono; unicidade de cliente/UC/fornecedor; vínculos entre empresas e entre pedido e cotação; `CHECK` de status e de mês; FKs de autoria; troca `SET NULL`/`CASCADE` por `RESTRICT` onde conflita com imutabilidade; gatilho `BEFORE TRUNCATE`; índices de FK.
4. **Retenção** (US8): job de limpeza de sessões expiradas; política documentada; procedimento de apagamento verificado em ensaio.

Rollback: `rollback.sql` por migração (colunas novas ficam, inofensivas, enquanto o código antigo roda); o código novo só passa a exigir a coluna depois do passo de contração.

### Fatia 4: sustentação

Publicação reversível (tags por SHA, últimas N versões, prontidão com repetição, trava, build fora da VPS, deploy por SSH com comando forçado, retirada do runner da VPS); `/health/ready`; request-id, access log, logger sem perda de pilha; Sentry com limpeza de dado pessoal; limites de memória/CPU e rotação de logs; healthcheck do web; imagem enxuta; CI completa (todas as suítes, deriva do Prisma, cobertura mínima nos módulos críticos, build de imagem, `shellcheck`, Renovate, pins por SHA, cache, relato de testes instáveis, `tsconfig` de testes, lint com regras de tipo); testes contra banco real para os repositórios grandes e teste de contrato dos dublês; e2e com usuários de papéis restritos e upload; consolidação dos adaptadores S3 e do escopo; configuração toda no schema; fixtures fora do build; assíncrono para OCR, LLM e PDF; higiene (fontes, código morto, CSP, `/design-system`); documentação atualizada.

Rollback: por PR; a mudança de deploy mantém o caminho antigo (`publicar.sh`) até a verificação do novo.

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Reescrever o histórico quebra clones, PRs e o runner | Alto | Congelar a `main`, merge prévio dos PRs, espelho offline por 30 dias, comunicar todos, refazer o checkout do runner |
| Cópias já feitas por terceiros (forks, caches) não somem | Alto | Tratar como exposição ocorrida (LGPD), pedir limpeza ao GitHub, avaliar rotacionar o que for derivado dos dados |
| Backup externo com chave perdida | Crítico | Duas chaves `age` (dono offline com cópia, e a de teste); ensaio de restauração com a chave do dono antes de apagar o backup antigo |
| Guard global fechado por padrão derruba rota legítima | Alto | Modo aviso na fatia 1; inventário aprovado; imposição só na fatia 2 com variável de retorno |
| Backfill de empresa atribui errado | Alto | Tudo `plugga` (como a migração de agosto), duvidosos em fila, nada adivinhado, teste de equivalência de alcance |
| Migração trava tabela | Médio | Tabelas pequenas; `NOT VALID`/`VALIDATE`; teste de duração em cópia do banco |
| Duplicatas impedem restrição de unicidade | Médio | Listagem prévia e decisão do dono antes de aplicar |
| Terceiros com dado (B2, Sentry, monitor) | Médio | Backup criptografado antes do envio; Sentry com limpeza e sem corpo de requisição; monitor só vê status HTTP |
| Disco e memória da VPS | Médio | Backup temporário em pipeline sem gravar tudo em disco quando possível; Sentry em nuvem (não self-hosted); medir antes de cada instalação |
| Mudar a CI aumenta o tempo | Baixo | Cache, jobs paralelos, meta de 15 min |
| Muitas frentes ao mesmo tempo | Médio | PRs pequenos por bloco, fatias independentes, um responsável por fatia |

## Complexity Tracking

| Desvio | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| Script próprio de scanner em vez de só `gitleaks` | CNPJ/CPF precisam de dígito verificador para evitar falso positivo em IDs e datas | Regra de regex do `gitleaks` marcaria centenas de números legítimos e seria desligada |
| Duas chaves `age` (dono e teste) | Permitir restauração semanal automática sem expor a chave de recuperação do dono | Uma chave só obriga restauração manual, que não acontece com regularidade |
| Guard global + inventário versionado | Torna a regra impossível de esquecer em rota nova | Revisar 130 rotas à mão não evita regressão |
| Auxiliar de escopo explícito nos repositórios | Visível, testável e compatível com o Prisma atual | Extensão do cliente Prisma esconde o filtro e falha em `findUnique` |
| Sentry (terceiro) | Erro com pilha e alerta sem operar mais um serviço na VPS de 8 GB | GlitchTip self-hosted precisa de Postgres e worker próprios |

## Estado do plano

Fase 0 (research.md) e Fase 1 (data-model.md, contracts/, quickstart.md) concluídas. Próximo passo: `/speckit-tasks` para gerar `tasks.md`, com a Fatia 1 como primeira entrega.
