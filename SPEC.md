# Spec: Migração do armazenamento de objetos, de MinIO para SeaweedFS (produção)

Status: **decisões registradas, pronto para `/plan`**. Única mudança feita na VPS até aqui: limpeza de imagens e cache Docker sem uso (Fase 0).

## Objective

Trocar o servidor de objetos (S3) da produção, hoje MinIO (`plugga-os-minio-1`), por SeaweedFS, que o código do repositório e o ambiente local já usam. Os arquivos guardados (faturas enviadas, cotações, evidências, backups do banco e corpus) devem continuar acessíveis, sem perda e com indisponibilidade mínima.

Quem usa: a equipe da Plugga/Waze (envia e consulta faturas e cotações) e a rotina de backup diário.

Por que agora: o `compose.yaml` do repositório já aponta a API para o SeaweedFS. Se a próxima publicação sair sem esta migração, a API sobe apontando para um armazenamento vazio e os arquivos antigos somem da tela.

## O que existe hoje (verificado na VPS em 2026-09-24, só leitura)

| Item | Estado |
|---|---|
| Armazenamento em produção | `plugga-os-minio-1`, `STORAGE_ENDPOINT=http://minio:9000`, região `us-east-1` |
| Baldes | `plugga-faturas`, `plugga-corpus-faturas`, `plugga-backups` |
| Volume de dados | `plugga-os_minio_data`, 29 MB |
| Backup diário | `/root/backup-plugga.sh`, dump do Postgres para `plugga-backups/diario/`, último OK em 2026-09-24 03:10 |
| Disco da VPS | 96 GB, **95% usado, 5,7 GB livres** (imagens Docker somam 64 GB, cache de build 8,9 GB) |
| Memória | 7,9 GB, aproximadamente 2,8 GB disponíveis |
| Código | Acesso S3 genérico (`armazenamento.ts`, `armazenamento-de-cotacoes.ts`, `corpus.ts`), troca de servidor é só configuração |

## Recomendação

Manter a migração, mas como troca de configuração com rollback, não como reescrita:
- O volume é pequeno (29 MB) e o código só fala S3, então o risco técnico é baixo.
- Ter o mesmo servidor em local e produção evita "funciona na minha máquina" com armazenamento.
- Pelo que sei, o MinIO comunitário reduziu a manutenção e o console em 2025. Vale confirmar isso antes de citar ao cliente como motivo.
- O que mais preocupa não é a migração e sim o **disco a 95%**: deve ser tratado antes (ver Fase 0).

## Suposições (corrija agora ou sigo com elas)

1. Uma janela curta de manutenção (poucos minutos) é aceitável para a troca.
2. O SeaweedFS roda no mesmo servidor, no modo `mini` já definido no `compose.yaml`.
3. Os baldes e o conteúdo são copiados como estão, sem renomear.
4. O volume do MinIO é mantido por pelo menos 14 dias como rollback.
5. Os scripts de backup na VPS (`/root/backup-plugga.sh`) serão atualizados para o novo endpoint.
6. Nenhuma mudança de esquema de banco.

## Commands

```
# Estado da VPS (leitura)
ssh -i ~/.ssh/plugga-vps-2 root@82.29.152.21 'cd /opt/plugga-os && docker compose ps'

# Subir o SeaweedFS e criar os baldes
docker compose --profile app up -d seaweedfs seaweedfs-provisiona

# Copiar os dados (volume pequeno)
docker compose --profile storage-migration run --rm seaweedfs-migracao

# Conferir contagem e tamanho dos objetos nos dois lados
mc ls --recursive --summarize source/plugga-faturas
mc ls --recursive --summarize dest/plugga-faturas

# Testes locais antes de publicar
pnpm --filter @plugga/api test
pnpm typecheck
```

## Project Structure

```
compose.yaml            → serviços seaweedfs, seaweedfs-provisiona, seaweedfs-migracao, minio-legacy
ops/deploy.sh           → publicação na VPS (ordem: migrar banco, depois subir)
ops/backup-plugga.sh    → backup diário (precisa apontar para o SeaweedFS)
ops/prepara-*-minio.sh  → preparação de backup e corpus
apps/api/src/.../armazenamento*.ts → acesso S3 (só configuração muda)
SPEC.md                 → este documento
```

## Plano em fases (cada uma termina em verificação)

**Fase 0, folga de disco (pré-requisito).** Liberar espaço das imagens e do cache de build Docker antigos, sem tocar em volumes. Meta: pelo menos 25 GB livres. Verificação: `df -h /`.

**Fase 1, snapshot e preparo.** Backup extra do Postgres e cópia do volume do MinIO para fora do container. Verificação: dump restaurável em banco temporário e checksum da cópia.

**Fase 2, SeaweedFS ao lado do MinIO.** Subir o SeaweedFS e criar os baldes, sem apontar a API para ele. Verificação: `mc ls` nos três baldes.

**Fase 3, cópia dos dados.** Copiar com `mc mirror` (MinIO para SeaweedFS). Verificação: mesma contagem de objetos, mesmo tamanho e amostra de checksum por balde.

**Fase 4, troca (janela curta).** Parar escritas, repetir a cópia incremental, trocar `STORAGE_ENDPOINT` para `http://seaweedfs:8333`, reiniciar a API. Verificação: abrir uma fatura e uma cotação antigas, enviar uma nova, `GET /health`.

**Fase 5, backup e observação.** Atualizar e rodar `backup-plugga.sh`, confirmar o dump no novo destino. Manter o MinIO parado, mas com volume intacto, por 14 dias.

**Rollback:** voltar `STORAGE_ENDPOINT` para `http://minio:9000`, subir o MinIO e reiniciar a API. Só é possível enquanto o volume antigo existir.

## Code Style

Sem código novo na aplicação. Mudanças em shell seguem `ops/deploy.sh`: `set -euo pipefail`, mensagens em português, checagem explícita de cada etapa e nenhum segredo impresso.

## Testing Strategy

- Unitários existentes do armazenamento (`armazenamento.spec.ts`, `corpus.spec.ts`) continuam passando.
- Ensaio completo em ambiente local: subir MinIO com dados de exemplo, migrar para SeaweedFS e conferir contagem e checksum, antes de tocar na VPS.
- Na VPS, o teste é a checagem de cada fase (contagem, tamanho, checksum e abertura de arquivo real).

## Boundaries

- **Sempre:** ler o estado antes de alterar; ter backup verificado antes da troca; conferir contagem e checksum; manter o rollback disponível.
- **Perguntar antes:** apagar volumes, imagens ou cache na VPS; parar a API (janela de manutenção); alterar o `.env` de produção; publicar via `main`.
- **Nunca:** apagar o volume do MinIO nos 14 dias de observação; imprimir chaves de acesso; mexer no Postgres além do backup; rodar `docker compose down -v` na VPS.

## Success Criteria

- Os três baldes existem no SeaweedFS com a mesma contagem e o mesmo tamanho total do MinIO.
- Uma fatura e uma cotação antigas abrem pela tela após a troca; um envio novo funciona.
- Backup diário seguinte grava o dump no novo destino e o dump restaura em banco temporário.
- A API fica saudável e a indisponibilidade da troca dura menos de 5 minutos.
- Disco da VPS com pelo menos 25 GB livres ao final.
- O `compose.yaml` final, já sem o MinIO ativo, é publicado via PR e passa no CI.

## Decisões (2026-09-24)

1. **Limpeza de disco: aprovada e feita (Fase 0 concluída).** Removidas só imagens sem uso e cache de build, sem `-a` e sem tocar em volumes. Disco foi de 95% para 51% usado (5,7 GB para 48 GB livres). Os 23 containers seguiram no ar. A VPS também hospeda outros projetos (frep, hermes, omniroute), que não foram alterados.
2. **Janela de manutenção:** é um horário combinado, fora do expediente, em que o sistema fica alguns minutos indisponível para trocarmos o armazenamento com segurança. Horário ainda a definir, sugestão: início da noite ou fim de semana.
3. **Backup externo: fora desta spec.** O script de backup só é ajustado para apontar ao novo endpoint (suposição 5).
4. **SeaweedFS em modo completo** (`weed server` com filer e S3), não `mini`. O `compose.yaml` será alterado para isso e validado no ensaio.
5. **Ensaio local: aprovado.** Depende do Docker Desktop estar ligado neste computador.

6. **Janela de manutenção dispensada:** o sistema ainda não tem usuários em produção (informado pelo dono do projeto em 2026-09-24). A troca pode ser feita a qualquer hora, mas mantém-se a parada breve das escritas durante a cópia final.
7. **Ensaio local concluído (2026-09-24), resultado OK:** MinIO 2025-04-22 e SeaweedFS completo (`weed server -filer -s3`, mesma imagem fixada por digest), com credenciais por `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. Foram migrados 30 objetos em 3 baldes (incluindo nome com acento e espaço, arquivo vazio e arquivo de 8 MB) com `mc mirror --overwrite`. Contagem e SHA-256 de cada objeto coincidem, e uma escrita nova via AWS SDK com `forcePathStyle` funciona.
8. **Achado:** a imagem `minio/mc` não tem `awk` nem `sed`. A primeira tentativa de conferência passou com "0 = 0" sem comparar nada. A verificação de produção deve ser feita por script que **falha se a origem tiver 0 objetos** ou se as contagens divergirem.
9. **Onde roda o Plugga OS:** só na VPS `82.29.152.21` (chave `plugga-vps-2`). A VPS maior (`2.24.208.189`, 8 CPUs, 32 GB, chave `plugga-vps`) roda o `plugga-sistema`, que é outro produto (`instagram-commercial-agent`), sem Postgres nem armazenamento de objetos do Plugga OS.

10. **Decisão do dono (2026-09-24): não migrar dados.** O MinIO foi parado e o SeaweedFS começa vazio, com backup novo. O que existia (1 fatura de teste, corpus de teste e 32 dumps antigos) ficou só no volume do MinIO e no snapshot `/root/snapshots/minio_data-T4-*.tar`, que continuam preservados.

## Open Questions

1. Confirmar que o Plugga OS deve continuar na VPS `82.29.152.21` (48 GB livres após a limpeza) ou se a intenção é mudá-lo para a VPS maior. Isso muda o alvo da migração.
