# Projeto — dados para o Condutor

> Lido pelo Condutor e pelos papéis. Os comandos ficam no AGENTS.md.

branch_base: develop

## Verificação em 2026-10-09

| Ação | Resultado | Duração |
|---|---|---|
| Instalar | ok | 0,4 s |
| Lint | ok — 4 tarefas Turbo em cache | 0,5 s |
| Typecheck | ok — 6 tarefas Turbo em cache | 0,6 s |
| Testes | ok — 884 passaram, 75 ignorados na API; 100 passaram na web | 0,4 s |

## Linha de base — commit e88d19f

Falhas que já existem antes de qualquer feature (não são responsabilidade das issues):

- Nenhuma falha nas quatro verificações acima. O código de `apps/` e `packages/` não mudou
  entre `e88d19f` (medição) e `46b623f` (base atual da branch).
- O `DATABASE_URL` deste checkout inicialmente tinha senha diferente da configurada no
  contêiner local `plugga-os-postgres-1`. Foi alinhado no `.env` ignorado pelo Git, sem
  inventar ou registrar a credencial. `migrate status` confirmou autenticação e esquema em dia.

## Ambiente local

| Item | Valor |
|---|---|
| Porta da develop | web 3000 · API 3001 (http://develop.localhost:3000) |
| Porta de teste (Condutor) | 3001 (http://teste.localhost:3001) |
| Porta da sessão visual | 3002 (http://visual.localhost:3002) |
| Banco de teste | `$env:POSTGRES_PORT='55433'; docker compose -p plugga-os-teste up -d --wait postgres` (adaptado do banco isolado D01; testar no primeiro uso). Para stack completo, `REDIS_PORT`, `STORAGE_PORT` e `STORAGE_ADMIN_PORT` também precisam de portas livres próprias. |
| Recriar banco de teste como cópia da develop | `pg_dump` do contêiner local `plugga-os-postgres-1` → `pg_restore` em `plugga-os-teste-postgres-1`; comandos abaixo adaptados do D01, testar no primeiro uso. |
| Apagar banco de teste | `docker compose -p plugga-os-teste down -v` (adaptado; usar somente para o banco isolado de teste). |
| Caminho de verificação | `/health` → 200; `/` → 307 para login (resultados medidos nas portas 3101/3100 em 2026-10-09). |
| Arquivos necessários fora do git | `.env` por worktree; neste checkout, `DATABASE_URL` já autentica no Postgres local em 55432 |

### Cópia do banco local da develop para teste

Comandos adaptados da cópia D01, ainda não testados para `plugga-os-teste`.
A origem é o contêiner **local** na porta 55432; as portas padrão dos túneis não entram
nesta cópia. O arquivo temporário é removido ao fim. Antes do primeiro uso, resolver
o conflito entre a API da develop (porta 3001) e a web de teste (porta 3001).

```powershell
$env:POSTGRES_PORT='55433'
docker compose -p plugga-os-teste up -d --wait postgres
$dump = Join-Path $env:TEMP 'plugga-os-teste.dump'
docker exec plugga-os-postgres-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/plugga-os-teste.dump'
docker cp plugga-os-postgres-1:/tmp/plugga-os-teste.dump $dump
docker cp $dump plugga-os-teste-postgres-1:/tmp/plugga-os-teste.dump
docker exec plugga-os-teste-postgres-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --clean --if-exists /tmp/plugga-os-teste.dump'
docker exec plugga-os-postgres-1 rm -f /tmp/plugga-os-teste.dump
docker exec plugga-os-teste-postgres-1 rm -f /tmp/plugga-os-teste.dump
Remove-Item -LiteralPath $dump -Force
```

No D01 copiado em 2026-10-09, `pnpm db:migrate:deploy` encontrou 19 migrations e
nenhuma pendente; `pnpm db:seed` passou. A receita adaptada para teste ainda requer
verificação no primeiro uso.

## Linear

time: Plugga OS (PLU)

- Time confirmado pelo André em 2026-10-09. Workspace: Zynox.
- Status: `Backlog`, `Ready`, `In Progress`, `In Review`, `Verifying`, `Done` e `Canceled` presentes. Há também `Duplicate`, além dos sete previstos em `docs/fluxo/00-convencoes.md`; André deve decidir sua remoção em *Settings → Team → Workflow*.
- Labels de workspace: grupo `Type` com Feature, Bug, Hotfix, Refactor, Performance, Security, Infra, Chore e Docs; grupo `Severity` com S1, S2, S3 e S4; flags Breaking Change, DB Migration, Needs Design e Blocked: Client. Todas presentes; nenhuma label criada.
- Specs: a consulta paginada de 263 issues do PLU, incluindo arquivadas, encontrou `Spec 002` nos títulos, mas não `Spec 001` nem `Spec 003`. As pastas locais são `specs/001-migracao-storage-seaweedfs/`, `specs/002-fundacao-solida/` e `specs/003-produto-unificado/`. Conferir a correspondência antes de calcular o próximo número (`maior Spec NNN do time + 1`).

### Configurações para André conferir no Linear

- Escala de estimativas T-shirt: não verificável pelo MCP disponível.
- Fechar sub-issues quando a issue pai fechar: não verificável pelo MCP disponível.
- Automações do GitHub: PR aberto → nenhuma ação; merge em `develop` → Done; merge de `hotfix/*` em `main` → Done. Não verificáveis pelo MCP disponível.
- Formato de branch `<tipo>/<identificador>-<título>`: não verificável pelo MCP disponível.
- Pipeline de Releases ligado à `main`: nenhum pipeline retornado para o time PLU; configurar ou confirmar em Settings.
- Template de projeto com milestones Alpha, Beta e GA: nenhum template de projeto retornado para o time PLU; criar ou confirmar em Settings.
