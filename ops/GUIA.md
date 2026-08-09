# Guia rápido

Os comandos do dia a dia, na ordem em que aparecem.

---

## Começar o dia

Abra o **Docker Desktop**, depois:

```bash
cd ~/Projects/plugga-sistema
docker compose up -d postgres redis minio mailpit
pnpm dev
```

O sistema fica em <http://localhost:3000>.

O que cada contêiner faz:

| | |
|---|---|
| `postgres` | o banco |
| `redis` | filas de trabalho em segundo plano |
| `minio` | guarda as faturas enviadas — painel em <http://localhost:9001> |
| `mailpit` | caixa de e-mail falsa — veja em <http://localhost:8025> |

A API e o site **não** vão no Docker: rodam com `pnpm dev` para recarregar sozinhos quando você salva um arquivo.

### Por que o Mailpit em desenvolvimento

Produção manda e-mail de verdade pelo Brevo. Aqui, não — cada teste de convite gastaria crédito e mandaria mensagem para endereço inventado. O Mailpit captura tudo e não entrega nada; você lê em <http://localhost:8025>.

---

## Terminar o dia

```bash
docker compose down
```

Os dados ficam salvos. No dia seguinte, `up -d` de novo e está tudo lá.

---

## Trabalhar

### Mudou o banco de dados

```bash
pnpm --filter @plugga/api db:migrate    # cria a migração e aplica aqui
```

À vontade: é a sua máquina. Se quebrar, veja "recomeçar do zero" abaixo.

### Antes de commitar

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Os três precisam passar. É o mesmo que o GitHub roda.

### Commit e envio

```bash
git add .
git commit -m "descrição do que mudou"
git push
```

---

## Publicar em produção

```bash
./ops/publicar.sh
```

Um comando. Ele publica o que está na **`main` do GitHub** — então commit e push primeiro.

O que acontece, nesta ordem:

```
1. backup do banco          existe de onde voltar
2. marca a versão atual     reverter fica instantâneo
3. constrói as imagens
4. migra o banco            ← junto com o programa, nunca separado
5. sobe api e web
6. teste de fumaça          volta atrás sozinho se reprovar
```

Leva alguns minutos, quase tudo na construção das imagens.

**Se o teste de fumaça reprovar**, o programa anterior volta sozinho e o script avisa. O banco **não** é revertido automaticamente — isso é decisão sua, porque a restauração apagaria o que entrou depois do backup.

---

## Quando algo dá errado

### Recomeçar o banco local do zero

```bash
docker compose down -v          # apaga os dados locais
docker compose up -d postgres redis minio mailpit
pnpm --filter @plugga/api db:migrate:deploy
pnpm --filter @plugga/api db:seed
```

### Trazer dados reais de produção para a sua máquina

```bash
ssh plugga-vps '. /root/.plugga-backup.env && docker run --rm \
  --network plugga-os_default \
  -e MC_HOST_b="http://$BACKUP_ACCESS_KEY:$BACKUP_SECRET_KEY@minio:9000" \
  minio/mc:RELEASE.2025-04-16T18-13-26Z \
  cat b/plugga-backups/diario/$(ssh plugga-vps ". /root/.plugga-backup.env && docker run --rm --network plugga-os_default -e MC_HOST_b=\"http://\$BACKUP_ACCESS_KEY:\$BACKUP_SECRET_KEY@minio:9000\" minio/mc:RELEASE.2025-04-16T18-13-26Z ls b/plugga-backups/diario/ | tail -1 | awk "{print \$NF}")' \
  > /tmp/producao.dump

pg_restore -h localhost -U plugga_os -d plugga_os --clean --no-owner /tmp/producao.dump
```

### Olhar produção

```bash
ssh plugga-vps 'docker logs plugga-os-api-1 --tail 50'    # o que a API registrou
ssh plugga-vps 'docker compose -f /opt/plugga-os/compose.yaml ps'
```

### Voltar a versão anterior à mão

```bash
ssh plugga-vps 'cd /opt/plugga-os
  docker tag plugga-os-api:anterior plugga-os-api:latest
  docker tag plugga-os-web:anterior plugga-os-web:latest
  docker compose up -d api web'
```

---

## O túnel para a VPS

Existe um túnel SSH permanente da sua máquina para a VPS, instalado como serviço
do sistema (`br.app.plugga.tunnel`). Ele expõe, em `localhost`:

```
5432  banco de produção
6379  redis de produção
1025 / 8025  mailpit de produção
```

**Com o banco local, ele deixa de ser necessário no dia a dia** — mas continua
lá para quando você quiser olhar produção.

> **Cuidado:** enquanto o túnel está ativo, `localhost:5432` pode ser o banco
> **de produção**, não o seu. Se o `DATABASE_URL` do seu `.env` apontar para
> `localhost:5432` sem o Docker local rodando, você está em produção sem saber.
> Foi assim que dados foram apagados em 2026-08-08.

Para desligar o túnel enquanto trabalha:

```bash
launchctl unload ~/Library/LaunchAgents/br.app.plugga.tunnel.plist   # desliga
launchctl load  ~/Library/LaunchAgents/br.app.plugga.tunnel.plist    # liga
```

---

## Backup

Roda sozinho todo dia às 00:10 (horário de Manaus) e guarda no MinIO da VPS.
Não precisa fazer nada. Para conferir que está funcionando:

```bash
ssh plugga-vps 'tail -5 /var/log/plugga-backup.log'
```

Para forçar um backup agora:

```bash
ssh plugga-vps '/root/backup-plugga.sh'
```
