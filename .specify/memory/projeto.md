# Projeto — dados para o Coordenador

> Lido pelo Coordenador e pelos Diretores. Os comandos ficam no AGENTS.md.

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
| Porta da develop | web 3000 · API 3001 |
| Subir aplicação em porta de teste | Em shells separados: `$env:PORT='3101'; pnpm --filter @plugga/api dev` e `$env:API_INTERNAL_URL='http://127.0.0.1:3101'; pnpm --filter @plugga/web exec next dev --port 3100` (testados com o banco isolado) |
| Portas dos Diretores | 3001 (D01) · 3002 (D02) · 3003 (D03) |
| Banco isolado do Diretor | `$env:POSTGRES_PORT='55433'; docker compose -p plugga-os-d01 up -d --wait postgres` (testado); para stack completo, `REDIS_PORT`, `STORAGE_PORT` e `STORAGE_ADMIN_PORT` também precisam de portas livres próprias |
| Copiar banco da develop → Diretor | `pg_dump` do contêiner local `plugga-os-postgres-1` → `pg_restore` em `plugga-os-d01-postgres-1`; testado em 2026-10-09 (172463 bytes), receita abaixo |
| Testes usam banco local compartilhado | não; a suíte padrão usa testes em memória e os testes de integração exigem infraestrutura própria |
| URL de verificação | `http://127.0.0.1:3101/health` → 200; `http://127.0.0.1:3100/` → 307 para login, com a cópia isolada |
| Arquivos necessários fora do git | `.env` por worktree; neste checkout, `DATABASE_URL` já autentica no Postgres local em 55432 |

### Cópia do banco local da develop para D01

Comandos testados em PowerShell. A origem é o contêiner **local** na porta 55432; as
portas padrão dos túneis não entram nesta cópia. O arquivo temporário é removido ao fim.

```powershell
$env:POSTGRES_PORT='55433'
docker compose -p plugga-os-d01 up -d --wait postgres
$dump = Join-Path $env:TEMP 'plugga-os-d01.dump'
docker exec plugga-os-postgres-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/plugga-os-d01.dump'
docker cp plugga-os-postgres-1:/tmp/plugga-os-d01.dump $dump
docker cp $dump plugga-os-d01-postgres-1:/tmp/plugga-os-d01.dump
docker exec plugga-os-d01-postgres-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --clean --if-exists /tmp/plugga-os-d01.dump'
docker exec plugga-os-postgres-1 rm -f /tmp/plugga-os-d01.dump
docker exec plugga-os-d01-postgres-1 rm -f /tmp/plugga-os-d01.dump
Remove-Item -LiteralPath $dump -Force
docker compose -p plugga-os-d01 down -v
```

No D01 copiado, `pnpm db:migrate:deploy` encontrou 19 migrations e nenhuma pendente;
`pnpm db:seed` passou. O stack D01 e seu volume foram removidos após a verificação.

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
