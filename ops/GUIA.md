# Guia rápido

Os comandos do dia a dia, na ordem em que aparecem.

---

## Começar o dia

Abra o **Docker Desktop**, depois:

```bash
cd ~/Projects/plugga-os
docker compose up -d postgres redis minio minio-provisiona
pnpm dev
```

O sistema fica em <http://localhost:3000>.

O que cada contêiner faz:

| | |
|---|---|
| `postgres` | o banco — porta **55432** |
| `redis` | filas de trabalho em segundo plano — porta **56379** |
| `minio` | guarda as faturas enviadas — painel em <http://localhost:59001> |
| `minio-provisiona` | cria o balde das faturas e encerra; é normal ele sair |

**As portas são altas de propósito.** As padrão — 5432, 6379, 1025, 8025, 9000,
9001 — estão ocupadas pelos túneis para a VPS, então nelas `localhost` é
produção. Ver "O túnel para a VPS", no fim.

A API e o site **não** vão no Docker: rodam com `pnpm dev` para recarregar sozinhos quando você salva um arquivo.

Sem Mailpit local (removido em 10/08/2026 — Brevo é o único provedor desde
09/08/2026), `EMAIL_PROVIDER=noop` é o padrão local: convite e reset não
entregam de verdade em dev, só logam sem token/link. Testar o envio de verdade
exige `EMAIL_PROVIDER=brevo` com chave real — manda e-mail de verdade, não use
de rotina.

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

### O corpus de faturas

As fixtures que provam o leitor contra fatura de verdade **não estão no
repositório**. Elas carregam o dado do cliente inteiro — nome, CNPJ, unidade
consumidora, endereço — porque é isso que o leitor tem de provar que extrai e é
isso que o relatório entrega. Anonimizar quebraria a prova; o que muda é o
lugar: git é permanente, replica em todo clone e não tem revogação.

O corpus mora no balde `plugga-corpus-faturas` do MinIO da VPS.

```bash
# com o túnel do MinIO de pé e CORPUS_* no .env
pnpm --filter @plugga/api corpus:baixar      # traz para apps/api/test/corpus
pnpm --filter @plugga/api corpus:publicar    # sobe o que está lá
```

A pasta de destino é ignorada pelo git — a proteção não depende de ninguém
lembrar.

Acrescentar uma fatura ao corpus são dois passos, e eles escrevem em lugares
diferentes de propósito:

```bash
pnpm --filter @plugga/api fatura:congelar <arquivo> --nome <slug>
#   apps/api/test/corpus/<slug>.pagina.json          → a fatura, fora do git
#   apps/api/src/.../fatura/<slug>.corpus.spec.ts    → o teste, para commitar
pnpm --filter @plugga/api corpus:publicar
```

O JSON é a fatura do cliente e cai na pasta ignorada; o spec é código e fica ao
lado do leitor que ele prova. Congelar **não** publica: subir para o balde é um
passo que se pede, não um efeito colateral.

**Sem as chaves nada quebra.** Os testes de corpus pulam com uma mensagem
dizendo por quê, e o resto da suíte roda igual. Quem não tem acesso ainda tem
`sintetica.spec.ts`, uma fatura fabricada — sem cliente nenhum — que prova o
leitor em qualquer máquina, sem credencial e sem rede.

As chaves ficam em `/root/.plugga-corpus.env` na VPS. São duas: a de **leitura**
vai para os secrets `CORPUS_LEITOR_ACCESS_KEY`/`CORPUS_LEITOR_SECRET_KEY` do
GitHub, que o job de corpus da CI usa; a de **escrita** fica com quem publica
fixture e não vai para secret nenhum — chave de escrita guardada num lugar que
nada automatizado usa é só uma coisa a mais para vazar. Criar tudo isso de novo:
`ops/prepara-corpus-minio.sh`, que é idempotente.

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

### Login com o Google

Vem desligado (`GOOGLE_AUTH_ENABLED=false`) e é assim que deve ser publicado da
primeira vez. Ligar, o rollout e o que fazer quando alguém não consegue entrar
estão em [docs/processos/login-google.md](../docs/processos/login-google.md).

**A pegadinha, para não perder uma tarde:** publicar **não** leva as variáveis
`GOOGLE_*` para a VPS. O `publicar.sh` preserva o `compose.yaml` de lá, e um
contêiner só enxerga o que aquele arquivo declara — pôr os valores só no `.env`
não faz efeito nenhum, sem erro e sem aviso. Antes de ligar, acrescente as três
linhas ao `compose.yaml` da VPS nos serviços `api` **e** `web`
(`grep -c GOOGLE_ compose.yaml` tem de dar 6).

Para desligar de volta, em `/opt/plugga-os`:

```bash
# GOOGLE_AUTH_ENABLED=false no .env, depois:
docker compose up -d --force-recreate api web
```

O botão some, a rota recusa, e o login por e-mail e senha nunca dependeu disso.
Não apague a tabela `user_identities` — os vínculos são aditivos e jogá-los fora
só dificulta voltar atrás.

---

## Quando algo dá errado

### Recomeçar o banco local do zero

```bash
docker compose down -v          # apaga os dados locais
docker compose up -d postgres redis minio minio-provisiona
pnpm --filter @plugga/api db:migrate:deploy
pnpm --filter @plugga/api db:seed
```

O `down -v` apaga só o que é local: os volumes têm o nome do projeto `plugga-os`
desta máquina e não alcançam a VPS.

### Trazer dados reais de produção para a sua máquina

```bash
ssh plugga-vps '. /root/.plugga-backup.env && docker run --rm \
  --network plugga-os_default \
  -e MC_HOST_b="http://$BACKUP_ACCESS_KEY:$BACKUP_SECRET_KEY@minio:9000" \
  minio/mc:RELEASE.2025-04-16T18-13-26Z \
  cat b/plugga-backups/diario/$(ssh plugga-vps ". /root/.plugga-backup.env && docker run --rm --network plugga-os_default -e MC_HOST_b=\"http://\$BACKUP_ACCESS_KEY:\$BACKUP_SECRET_KEY@minio:9000\" minio/mc:RELEASE.2025-04-16T18-13-26Z ls b/plugga-backups/diario/ | tail -1 | awk "{print \$NF}")' \
  > /tmp/producao.dump

pg_restore -h localhost -p 55432 -U plugga_os -d plugga_os --clean --no-owner /tmp/producao.dump
```

A porta **55432** é o que faz esse comando restaurar no banco local. Sem ela, o
`pg_restore` vai para a 5432 — o túnel — e o `--clean` derruba as tabelas de
produção antes de restaurar por cima.

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

Há **dois** túneis SSH desta máquina para a VPS. O permanente é um serviço do
sistema (`br.app.plugga.tunnel`); o do MinIO costuma ser aberto à mão. Juntos
eles ocupam, em `localhost`:

```
5432         banco de produção
6379         redis de produção
9000 / 9001  MinIO de produção — inclusive o balde dos backups
```

Nessas quatro portas, **`localhost` é produção**. É contraintuitivo e não aparece
em lugar nenhum do `.env` a não ser que se saiba procurar.

**A defesa é a numeração, não a atenção.** O stack local sobe na faixa 5xxxx
(55432, 56379, 59000, 59001) e é para lá que o `.env` aponta.
Assim os dois mundos coexistem sem disputar porta, e esquecer de subir o Docker
dá erro de conexão — não uma escrita silenciosa em produção.

O `db:migrate` recusa qualquer uma das seis portas acima em `127.0.0.1`, com
mensagem dizendo o porquê. Antes ele só conferia se o host era `localhost`, o
que aprovava produção e ainda dizia "only permits a local database".

> **Histórico:** em 2026-08-08 dados foram apagados exatamente por isso — o
> `DATABASE_URL` apontava para `localhost:5432` sem Docker local rodando.

Para desligar o túnel permanente enquanto trabalha:

```bash
launchctl unload ~/Library/LaunchAgents/br.app.plugga.tunnel.plist   # desliga
launchctl load  ~/Library/LaunchAgents/br.app.plugga.tunnel.plist    # liga
```

O do MinIO é um processo avulso; para conferir se está de pé e derrubá-lo:

```bash
pgrep -af "9000:127.0.0.1:9000"     # mostra o túnel do MinIO
pkill -f "9000:127.0.0.1:9000"      # derruba
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
