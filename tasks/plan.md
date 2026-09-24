# Plano de implementação: migração MinIO para SeaweedFS (produção)

Spec: `SPEC.md`. Alvo: VPS `82.29.152.21` (decisão de 2026-09-24: ficar nesta VPS; mudar para a maior só quando precisar).
Tarefas: `tasks/todo.md` (checklist markdown, sem tracker externo por enquanto).

## Visão geral
Trocar o servidor S3 da produção de MinIO (parado numa versão, sem console nem correções na edição gratuita) para SeaweedFS no modo `mini` (decisão de 2026-09-24; o modo completo também foi validado no ensaio), sem perder arquivo e sem mexer em Postgres, Redis ou web. Sem usuários em produção, então não há janela de manutenção, mas cada etapa tem verificação e rollback.

## O que a leitura do código e da VPS mostrou
- O código só fala S3; trocar de servidor é configuração (`STORAGE_ENDPOINT`).
- A VPS tem MinIO com 29 MB em 3 baldes (`plugga-faturas`, `plugga-corpus-faturas`, `plugga-backups`), volume `plugga-os_minio_data`.
- **Já existe um runner do GitHub Actions ativo na VPS** (`actions.runner.zynox-ia-plugga-os.plugga-vps`) e o `deploy.yml` dispara depois do CI na `main`. O deploy automático parece estar montado; falta testar de ponta a ponta.
- O `backup-plugga.sh` **na VPS** ainda aponta para `minio:9000` com credencial restrita de `/root/.plugga-backup.env`. O `deploy.sh` roda esse backup no passo 1. Se o MinIO parar sem repontar o backup, **todo deploy falha**. Por isso repontar o backup, no mínimo, entra no plano (sem construir backup externo).
- O `compose.yaml` do repositório (HEAD) faz a migração dentro do deploy, e a versão local não commitada a tira por perfil. Dois caminhos para o mesmo efeito, com risco de recriar Postgres. Vamos unificar.

## Decisões de arquitetura
- **Migração manual e verificada na VPS primeiro, PR depois.** Assim o repositório passa a refletir o que já está de pé e o deploy da `main` fica sem surpresa de storage.
- **Nada de `compose up` sem nomear serviço na VPS**, e `--no-deps` ao recriar a API: um `up -d` amplo recriaria Postgres e Redis por mudança de config (portas, imagem fixada).
- **MinIO só para depois da verificação**, e o volume `plugga-os_minio_data` fica 14 dias.
- **A conferência falha se a origem tiver 0 objetos** (achado do ensaio).
- Credenciais nunca impressas em log.

## Grafo de dependência
```
T1 compose (seaweedfs mini) ─┬─ T2 ops/migra-storage.sh ─┐
                                 └─ T3 backup/deploy/GUIA ────┤
                                                              ▼
                                    Checkpoint A (ensaio local com arquivos reais)
                                                              ▼
T4 pré-voo + snapshot ─ T5 SeaweedFS na VPS + cópia ─ T6 troca da API ─ T7 backup repontado
                                                              ▼
                                                     Checkpoint B (VPS)
                                                              ▼
                              T8 PR para main + CI ─ T9 desligar MinIO, doc e observação
```

## Lista de tarefas
Critérios de aceite e verificação de cada uma em `tasks/todo.md`.

### Fase 1, repositório e ensaio local
- T1 Compose com SeaweedFS mini
- T2 Script `ops/migra-storage.sh` (cópia + verificação)
- T3 Alinhar backup, deploy e GUIA
- Checkpoint A

### Fase 2, VPS (só com Checkpoint A verde)
- T4 Pré-voo e snapshot
- T5 SeaweedFS ao lado do MinIO e cópia
- T6 Troca da API para o SeaweedFS
- T7 Backup repontado
- Checkpoint B

### Fase 3, fechamento
- T8 PR para `main`
- T9 Desligar MinIO e documentar

## Riscos e mitigações
| Risco | Impacto | Mitigação |
|---|---|---|
| `up -d` amplo recria Postgres ao sincronizar o compose | Alto | Nomear serviços e usar `--no-deps`; conferir com `docker compose up --dry-run` antes |
| Backup quebra quando o MinIO parar | Alto | T7 antes de T9; backup manual rodado e restaurável |
| Cópia "passa" sem copiar nada | Alto | Verificação falha com origem vazia; checksum de cada objeto |
| SeaweedFS completo sem autenticação correta | Médio | Credenciais por env validadas no ensaio; acesso sem credencial deve falhar |
| Disco/memória da VPS (2 CPUs, 8 GB) | Médio | Disco já em 51%; conferir memória antes; SeaweedFS completo é leve para 29 MB |
| Merge na `main` dispara deploy com API de 6 semanas | Médio | T8 só depois de B; confirmar com você antes do merge |

## Perguntas em aberto
- Posso fazer o merge na `main` (dispara deploy real) quando o PR estiver verde? Pergunto antes.
- Confirmar que o runner da VPS está saudável e que o `deploy.yml` já funcionou alguma vez (histórico de Actions).
