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
