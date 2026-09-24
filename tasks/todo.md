# Tarefas: migração MinIO para SeaweedFS

Spec: `SPEC.md` | Plano: `tasks/plan.md`

## Fase 1: repositório e ensaio local

- [x] **T1 Compose com SeaweedFS mini** (S, `compose.yaml`) — feito 2026-09-24
  - Aceite: serviço `seaweedfs` usa o modo `mini` (decisão de 2026-09-24) com a imagem fixada por digest; volume `seaweedfs_data`; `minio-legacy` e `seaweedfs-migracao` atrás do perfil `storage-migration`; `api` depende de `seaweedfs` saudável e de `seaweedfs-provisiona` concluído; sem valor de segredo no arquivo.
  - Verificação: `docker compose config -q`; subir só `seaweedfs seaweedfs-provisiona` localmente em projeto isolado (`-p`) com `.env` de teste e listar os baldes.

- [x] **T2 `ops/migra-storage.sh`** (feito 2026-09-24; ensaio: `bash ops/migra-storage.test.sh`, 6 casos OK) (S, `ops/migra-storage.sh`, teste do script)
  - Aceite: copia os 3 baldes com `mc mirror --overwrite`; compara contagem e SHA-256 por objeto; **sai com erro se a origem tiver 0 objetos** ou houver qualquer divergência; não imprime credenciais; é idempotente.
  - Verificação: ensaio local com dados de exemplo (caso feliz, reexecução, objeto adulterado, objeto sem destino e origem vazia). O ensaio pegou um defeito real: o `docker` dentro do `while read` engolia o inventário e só o 1º objeto era copiado e conferido.

- [x] **T2b Baldes por empresa e departamento** (M, decisão de 2026-09-24; feito 2026-09-24)
  - Regra: balde = `{empresa}-{departamento}`, derivado de `packages/shared/src/organization.ts` (fonte única, a mesma dos acessos por departamento). Sete baldes de negócio: `plugga-comercial-clientes`, `plugga-energia-opm`, `plugga-produto-tecnologia`, `plugga-financeiro`, `waze-comercial-obras`, `waze-engenharia-obras`, `waze-financeiro`. Mais dois de sistema: `plugga-backups` e `plugga-corpus-faturas`. Todos com nome válido de S3 (minúsculas, hífen, até 63 caracteres).
  - Mapeamento inicial: faturas e estudos de eficiência energética -> `plugga-energia-opm`; cotações de compras -> `{empresa}-financeiro` (Compras está sob Financeiro nas duas empresas); evidências de obra -> `waze-engenharia-obras`. As chaves de arquivo existentes (`faturas/<id>/...`) não mudam.
  - Aceite: uma função única `baldeDe(empresa, departamento)` valida os dois contra `departmentIdsByCompany` e devolve o nome; os 3 adaptadores (`fatura/armazenamento.ts`, `compras/armazenamento-de-cotacoes.ts`, `obras/armazenamento-de-evidencias.ts`) usam essa função; `STORAGE_BUCKET` deixa de ser exigido; combinação inválida (ex.: `waze` + `energia-opm`) é recusada; `seaweedfs-provisiona` cria os nove baldes; credencial de cada balde limitada às pessoas do departamento é objetivo de acompanhamento, não desta tarefa.
  - Verificação: testes unitários da função (7 combinações válidas, combinações inválidas recusadas); testes dos 3 adaptadores; ensaio local com os nove baldes.
  - Migração dos dados existentes: a fatura `faturas/79191abf20c917dc/06-2026-SANTA-TEREZA.pdf` vai para `plugga-energia-opm`; o corpus e os backups mantêm seus baldes.

- [x] **T3 Alinhar backup, deploy e GUIA** (feito 2026-09-24) (S, `ops/backup-plugga.sh`, `ops/deploy.sh`, `ops/GUIA.md`)
  - Aceite: mensagens de rollback e textos deixam de citar MinIO como destino; `deploy.sh` não para mais o MinIO por nome fixo depois da troca; GUIA descreve o novo fluxo e o passo de repontar o backup.
  - Verificação: `bash -n` nos scripts; leitura cruzada com o `compose.yaml`.

### Checkpoint A
- [ ] Ensaio local completo com o `compose.yaml` e o script reais, resultado OK
- [ ] `pnpm typecheck` e `pnpm --filter @plugga/api test` verdes
- [ ] Revisão com o dono do projeto antes de tocar na VPS

## Fase 2: VPS `82.29.152.21`

- [x] **T4 Pré-voo e snapshot** (feito 2026-09-24 21:03 UTC; relatório na VPS em `/root/snapshots/T4-inventario-20260924-210312.txt`) (XS, sem alteração de código)
  - Aceite: contagem e tamanho dos 3 baldes registrados; dump do Postgres feito e restaurado em banco temporário; cópia do volume `plugga-os_minio_data` para `/root/snapshots/`; memória e disco conferidos.
  - Verificação: `pg_restore --list` do dump; `du -sh` e checksum da cópia.
  - Resultado: baldes `plugga-faturas` 1 objeto (320 KiB), `plugga-corpus-faturas` 24 (12 MiB), `plugga-backups` 32 (16 MiB), **57 objetos no total**. Dump de 510146 bytes restaurado em banco temporário (59 tabelas iguais; users=3, companies=2), banco temporário removido. Cópia do volume: 29122560 bytes, 180 arquivos, legível de ponta a ponta. Disco 51% e 48 GB livres.

- [x] **T5 SeaweedFS na VPS** (feito 2026-09-24 21:32 UTC; decisão do dono: **sem migrar dados**, começar do zero. Nove baldes criados e vazios; Postgres, Redis, API e web não foram recriados. `compose.yaml` e `ops/` sincronizados para `/opt/plugga-os`, com cópias `.bak-T5`)
  - Aceite: `seaweedfs` e `seaweedfs-provisiona` de pé sem recriar Postgres/Redis/API; migração por `ops/migra-storage.sh` com resultado OK; MinIO segue como principal.
  - Verificação: script sai com 0; acesso sem credencial ao S3 é negado; `docker compose ps` mostra os demais serviços com o mesmo tempo de vida.

- [ ] **T6 Troca da API: publicar o código novo** (M, deploy). **Revisado:** a imagem da API na VPS tem 6 semanas e ainda exige `STORAGE_BUCKET` e o MinIO. Só o código novo (`baldeDe`) e o compose novo falam com o SeaweedFS, então a troca é um deploy do código atual, não só uma variável. Enquanto isso, com o MinIO parado, guardar fatura degrada (chave nula) e cotações/evidências retornam 503; Compras e Obras têm 0 registros, e não há usuários
  - Aceite: `STORAGE_ENDPOINT=http://seaweedfs:8333` no `.env`; API recriada com `--no-deps`; fatura e cotação antigas abrem; envio novo funciona; `/health` OK.
  - Verificação: leitura e escrita pelo S3 SDK dentro da rede do compose; log da API sem erro de storage.
  - Rollback: voltar `STORAGE_ENDPOINT` para `http://minio:9000` e recriar a API.

- [x] **T7 Backup repontado** (feito 2026-09-24 21:32 UTC: usuário restrito criado por `ops/prepara-backup.sh`, `/root/backup-plugga.sh` trocado pela versão do repositório (antigo em `.bak-T7`), primeiro dump de 510146 bytes gravado em `plugga-backups/diario/` e lido de volta com 59 tabelas; cron `/etc/cron.d/plugga-backup` 03:10 UTC intacto) (S, `/root/backup-plugga.sh`, `/root/.plugga-backup.env`)
  - Aceite: usuário restrito do backup recriado no SeaweedFS (por `ops/prepara-backup-minio.sh`); um backup manual grava em `plugga-backups/diario/`; dump restaurável.
  - Verificação: `pg_restore --list` do dump novo; `tail /var/log/plugga-backup.log`.
  - Escopo: só repontar. Backup externo continua fora.

### Checkpoint B
- [ ] Sistema funcionando na VPS com SeaweedFS (leitura e escrita reais)
- [ ] Backup novo gravado e restaurável
- [ ] Contagem de objetos igual à do T4
- [ ] Revisão com o dono do projeto antes do PR

## Fase 3: fechamento

- [ ] **T8 PR para `main`** (S, PR)
  - Aceite: PR com T1 a T3, `SPEC.md` e `tasks/`; CI verde. **O merge dispara deploy real: só com aprovação.**
  - Verificação: checks do CI; `deploy.yml` no histórico do Actions.

- [~] **T9 Desligar MinIO e documentar** (MinIO **parado** em 2026-09-24 21:37 UTC, volume `plugga-os_minio_data` e snapshot `/root/snapshots/minio_data-T4-*.tar` preservados; falta anotar a data de remoção e o restante da documentação) (XS, VPS + docs)
  - Aceite: contêiner do MinIO parado e volume preservado por 14 dias (data de remoção anotada no GUIA); `SPEC.md` marcado como concluído.
  - Verificação: sistema segue saudável 24h depois.
