# Quickstart: verificação de cada fatia

Guia de validação ponta a ponta. Cada comando é executável a partir da raiz do repositório, **em ambiente local ou de teste**, nunca contra a produção. Passos que tocam a VPS estão marcados `[VPS]` e exigem aprovação do dono, backup restaurado antes e plano de reversão (constituição, princípio VI).

> Os scripts e testes citados abaixo (`simula-deploy-evento.mjs`, `scan-dados-cliente.mjs`, `backup-externo.sh`, suítes `atomicidade`, `isolamento` etc.) são **criados pelas tarefas** de cada fatia; este guia diz o que cada um deve provar quando existir.

## Como esta feature é verificada

Cada fatia tem um comando que a prova. Os que já existem rodam hoje; os demais falham de propósito com uma mensagem que diz qual tarefa os cria (ver `scripts/executa-ou-pendente.mjs`).

| Fatia / história | Comando | Estado |
|---|---|---|
| Fundação (envelope, auditoria, catálogo) | `pnpm --filter @plugga/api test -- erro-envelope audit-appender catalogo-eventos` | existe (T017, T021) |
| Fundação (gravação única no `event_log`) | `node scripts/verifica-eventlog.mjs` (já roda em `pnpm lint`) | existe (T018) |
| Fatia 1, US1 (publicação segura) | `pnpm test:scripts` e `bash ops/deploy-trava.test.sh` | existe (T027, T031) |
| Fatia 1, US2 (dados de cliente) | `pnpm test:scan-dados` | pendente (T036) |
| Fatia 1, US3 (backup) | `bash ops/restaurar-teste.test.sh` (e `ops/backup-externo.test.sh`) | restauração existe (T012); backup externo pendente (T052) |
| Fatia 1, US5 (inventário de rotas) | `pnpm test:routes-inventory` | pendente (T066) |
| Fatia 3 (migrações com volta) | `pnpm test:migrations:rollback` | pendente (T146) |

Os testes `ops/*.test.sh` que não usam Docker (`deploy-trava`, `restaurar-teste`) podem rodar numa máquina com Postgres local; o `restaurar-teste` precisa de `RESTAURA_PGHOST`, `RESTAURA_PGPORT` e `RESTAURA_PGUSER` (modo servidor, ver o cabeçalho do script).

## Pré-requisitos gerais

```bash
corepack enable && corepack install && pnpm install --frozen-lockfile
cp .env.example .env            # só placeholders locais
docker compose up -d            # Postgres, Redis, SeaweedFS locais
pnpm db:generate && pnpm db:migrate && pnpm db:seed
```

## Fatia 1: publicação, dados de cliente, backup, inventário

### 1. Publicação segura (US1, SC-001)

```bash
# Simulação do filtro do workflow, sem tocar produção:
node scripts/simula-deploy-evento.mjs scripts/fixtures/workflow_run_pr_fork_main.json   # esperado: NÃO publica
node scripts/simula-deploy-evento.mjs scripts/fixtures/workflow_run_push_main.json      # esperado: aguarda aprovação
node scripts/simula-deploy-evento.mjs scripts/fixtures/workflow_run_push_sha_antigo.json # esperado: pula (SHA não é a ponta)
```

Esperado: só o push na `main` oficial chega ao passo de aprovação. Em seguida, verificar nas configurações do GitHub: ambiente `production` com aprovadores, `main` protegida, `CODEOWNERS` ativo.

### 2. Dados de cliente (US2, SC-002)

```bash
CLIENT_NAMES_FILE=/caminho/fora/do/repo/nomes.txt node scripts/scan-dados-cliente.mjs --tree
pnpm test:scan-dados            # testes do scanner com valores sintéticos
CLIENT_NAMES_FILE=... node scripts/scan-dados-cliente.mjs --history   # após a reescrita (T047)
```

Esperado: 0 ocorrências fora de fixtures declaradas, e falha ao introduzir um CNPJ válido de teste não permitido. As suítes de regressão do leitor de fatura continuam verdes com as fixtures sintéticas:

```bash
pnpm --filter @plugga/api test
pnpm --filter @plugga/auditoria-oraculo test
```

### 3. Backup externo (US3, SC-003 a SC-005)

Ensaio local com SeaweedFS de teste e B2 simulado:

```bash
bash ops/backup-externo.test.sh      # caso feliz; origem vazia deve FALHAR; arquivo adulterado deve FALHAR
bash ops/restaurar-teste.test.sh     # restaura em contêiner descartável e confere contagens
```

Esperado: arquivo `.tar.age` e manifesto gerados, SHA-256 confere, restauração reproduz as contagens do manifesto, nenhuma chave aparece em `docker inspect` nem em `ps`. `[VPS]` após aprovação: rodar o backup real uma vez, confirmar no B2 (tentativa de apagar com a chave de escrita deve falhar), ensaiar a recuperação completa com a chave privada do dono e cronometrar. Provocar falha de propósito e confirmar o alerta por e-mail.

### 4. Inventário de rotas em aviso (US5)

```bash
pnpm --filter @plugga/api test -- inventario-rotas
```

Esperado: arquivo `contracts/inventario-rotas.json` gerado; relatório lista as rotas `undeclared` e as `public`; o app em modo `warn` registra em log, sem negar nada.

## Fatia 2: correções de código

```bash
ROUTE_GUARD_MODE=enforce pnpm --filter @plugga/api test          # nenhuma rota undeclared
pnpm --filter @plugga/api test -- atomicidade                      # 2 execuções concorrentes por operação crítica
pnpm --filter @plugga/api test -- limites-entrada                  # PDF de mil páginas, página gigante, imagem enorme, tipo falso
pnpm --filter @plugga/api test -- login-abuso                      # atacante não bloqueia terceiros nem a conta com senha certa
pnpm --filter @plugga/api test -- segredos-producao                # sobe em modo produção com segredo de exemplo: deve recusar
pnpm --filter @plugga/web test                                     # ids malformados, erros tipados, aviso de exemplo
pnpm test:e2e                                                      # fluxos completos
```

Esperado: SC-007 a SC-017. Verificar manualmente: o primeiro item "não verificado" da pesquisa (decodificação de `%2F` no Next) com um identificador `..%2F..%2Fauth%2Fme`.

## Fatia 3: migrações

```bash
pnpm test:migrations:from-zero                  # aplica tudo do zero
pnpm test:migrations:rollback                   # aplica a última, desfaz com rollback.sql, compara o esquema
pnpm --filter @plugga/api test -- isolamento    # matriz: usuários de empresas diferentes tentam tudo
pnpm --filter @plugga/api test -- restricoes    # inserções inválidas direto no banco de teste são recusadas
```

Antes de cada migração na VPS `[VPS]`: rodar `ops/restaurar-teste.sh` com o backup mais recente e anexar o resultado. Depois: conferir contagens, equivalência de alcance (script `ops/confere-alcance.sh` compara o alcance de cada pessoa antes e depois) e a fila `company_assignment_review`.

## Fatia 4: sustentação

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # gate local
docker build --target runtime -f apps/api/Dockerfile .    # build de imagem na CI
shellcheck ops/*.sh scripts/*.sh
curl -fsS localhost:3001/health/ready                      # banco, cache, armazenamento
```

Esperado: CI executa todas as suítes (SC-021), publicação com falha de prontidão reverte sozinha em até 5 min (SC-018), erro forçado aparece no rastreador com `requestId` e sem dado pessoal, e a documentação não contradiz o estado real (SC-023).

## Critério de aceite final

Todos os SC-001 a SC-026 verificados e registrados; nenhuma das bases a preservar regrediu (FR-080); nenhum passo exigiu indisponibilidade planejada (SC-026).
