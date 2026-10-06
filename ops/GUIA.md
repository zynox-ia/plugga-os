# Guia rápido

Os comandos do dia a dia, na ordem em que aparecem.

---

## Começar o dia

Abra o **Docker Desktop**, depois:

```bash
cd ~/Projects/plugga-os
docker compose up -d postgres redis seaweedfs seaweedfs-provisiona
pnpm dev
```

O sistema fica em <http://localhost:3000>.

O que cada contêiner faz:

| | |
|---|---|
| `postgres` | o banco — porta **55432** |
| `redis` | filas de trabalho em segundo plano — porta **56379** |
| `seaweedfs` | guarda as faturas enviadas — painel em <http://localhost:59001> |
| `seaweedfs-provisiona` | cria os baldes locais e encerra; é normal ele sair |

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

## Ambiente de teste isolado

Os testes que usam banco nunca reutilizam `plugga_os`. O ambiente resetável usa
`plugga_os_test` em `127.0.0.1:55433` e Redis em `127.0.0.1:56380`:

```bash
pnpm test:infra:up                  # sobe Postgres/Redis de teste
pnpm test:infra:reset               # recria e aplica migrações
pnpm test:migrations:from-zero      # recria, migra, semeia e verifica o banco
pnpm test:infra:down                # encerra o ambiente de teste
```

Os helpers recusam banco diferente de `plugga_os_test`; a CI usa o mesmo nome
em serviço efêmero. As portas 5432/6379/9000/9001 continuam proibidas em
desenvolvimento e teste porque podem ser túneis para Produção.

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

O leitor e a auditoria de faturas (módulo `energy-efficiency`, pacote
`auditoria-oraculo`, scripts e testes de corpus) foram removidos da árvore na
spec 002 (US2): carregavam dado real de cliente. Eles voltam por uma spec
própria, com fixtures sintéticas desde o início (faixa reservada em
`specs/002-fundacao-solida/quickstart.md`). O balde `plugga-corpus-faturas` e o
script `ops/prepara-corpus.sh` continuam existindo na VPS; o conteúdo do balde só
sai por decisão do dono.

As chaves ficam em `/root/.plugga-corpus.env` na VPS. São duas: a de **leitura**
vai para os secrets `CORPUS_LEITOR_ACCESS_KEY`/`CORPUS_LEITOR_SECRET_KEY` do
GitHub, que o job de corpus da CI usa; a de **escrita** fica com quem publica
fixture e não vai para secret nenhum — chave de escrita guardada num lugar que
nada automatizado usa é só uma coisa a mais para vazar. Criar tudo isso de novo:
`ops/prepara-corpus.sh` (idempotente; ensaio: `bash ops/prepara-corpus.test.sh`).

---

## Publicar em produção

```bash
./ops/publicar.sh
```

> **Proteção ligada em 2026-10-06:** a `main` exige PR e o check de CI, não aceita push forçado e vale também para administradores; o ambiente `production` do GitHub exige a aprovação do dono antes de publicar.
>
> **Fluxo de branches (decisão de 2026-10-05).** O trabalho entra na `develop`, que não publica nada. A `main` é produção e só recebe um PR de promoção `develop` → `main`, aprovado pelo dono. Veja `docs/AGENT.md`, seção "Branch flow".

Um comando. Ele publica o que está na **`main` do GitHub** — então commit e push primeiro.

> **`publicar.sh` é o caminho de emergência.** O caminho normal é automático: um push na `main` roda a CI e, se ela passar, o workflow `Deploy` **espera a aprovação humana** do ambiente `production` antes de publicar. Esse fluxo só publica push na `main` deste repositório (nunca PR, fork, agenda nem disparo manual) e, se a `main` já avançou, pula o commit velho. O `publicar.sh` mantém a mesma regra de fundo: só aceita uma referência que já esteja na história da `origin/main`, isto é, código que passou pela revisão e pela CI.
>
> **Uma publicação por vez.** `publicar.sh` e `deploy.sh` usam a mesma trava (`/var/lock/plugga-deploy.lock`). Se já há uma em andamento, a segunda recusa na hora, com a mensagem "Já existe uma publicação em andamento". Espere terminar e rode de novo; a trava solta sozinha quando o processo acaba, mesmo em erro.

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

**O que falta é só o `.env`.** Desde 2026-08-11 o `compose.yaml` sobe junto com
o código, então as linhas `GOOGLE_*` chegam à VPS pela publicação — não se edita
mais o compose de lá à mão. O que continua sendo manual é o `.env`, que é o
único arquivo preservado: preencha nele os valores e recrie os dois serviços.
Um contêiner só enxerga o que o compose declara, e o compose já declara.

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
docker compose up -d postgres redis seaweedfs seaweedfs-provisiona
pnpm --filter @plugga/api db:migrate:deploy
pnpm --filter @plugga/api db:seed
```

O `down -v` apaga só o que é local: os volumes têm o nome do projeto `plugga-os`
desta máquina e não alcançam a VPS.

### Dados de Produção não descem para desenvolvimento

Não restaure dumps brutos de Produção em Local Dev ou Local Test. Esses
ambientes usam dados sintéticos. Uma necessidade excepcional de diagnóstico
deve ser resolvida com telemetria, API de leitura segura ou dataset
irreversivelmente anonimizado sob aprovação explícita; o procedimento antigo
com `pg_restore --clean` foi removido por conflitar com a política de dados e
por tornar um erro de porta destrutivo.

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
sistema (`br.app.plugga.tunnel`); o do armazenamento costuma ser aberto à mão. Juntos
eles ocupam, em `localhost`:

```
5432         banco de produção
6379         redis de produção
9000 / 9001  reservadas ao túnel do armazenamento de produção — inclusive o balde dos backups
             (na VPS o SeaweedFS escuta em 59000/59001, só em 127.0.0.1)
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

O do armazenamento é um processo avulso; para conferir se está de pé e derrubá-lo:

```bash
pgrep -af "9000:127.0.0.1:9000"     # mostra o túnel do armazenamento
pkill -f "9000:127.0.0.1:9000"      # derruba
```

---

## Armazenamento de arquivos (baldes)

Os arquivos enviados (faturas, cotações, evidências de obra) ficam no SeaweedFS.
**Não há variável de balde**: o balde é `{empresa}-{departamento}`, derivado do
cadastro em `packages/shared/src/organization.ts`.

| Balde | O que guarda |
|---|---|
| `plugga-comercial-clientes` | Comercial da Plugga |
| `plugga-energia-opm` | Energia: faturas e estudos de eficiência energética |
| `plugga-produto-tecnologia` | Eletromobilidade (PluggaMob) |
| `plugga-financeiro` | Financeiro da Plugga, inclusive cotações de compras |
| `waze-comercial-obras` | Comercial da Waze |
| `waze-engenharia-obras` | Engenharia da Waze: evidências de obra |
| `waze-financeiro` | Financeiro da Waze, inclusive cotações de compras |
| `plugga-backups` | Cópias do banco (credencial própria, expiração em 30 dias/1 ano) |
| `plugga-corpus-faturas` | Material de teste das distribuidoras (fora do git) |

O `seaweedfs-provisiona` do compose cria todos eles; um teste (`compose-baldes.spec.ts`)
falha se um departamento novo do cadastro ficar sem balde.

**Preparar o que mora nos baldes de sistema**, na VPS (idempotente, ensaiado localmente):

```bash
ops/prepara-backup.sh    # usuário restrito e expiração do balde plugga-backups
ops/prepara-corpus.sh    # chaves de leitura e de escrita do balde do corpus
```

Não use `mc admin user` nem `mc admin policy`: eram comandos do MinIO, e no SeaweedFS o
usuário criado por eles não autentica. Os scripts acima criam os usuários pelo
`s3.configure` do próprio SeaweedFS. Ensaios locais: `bash ops/prepara-backup.test.sh` e
`bash ops/prepara-corpus.test.sh`.

---

## Backup

Roda sozinho todo dia às 00:10 (horário de Manaus) e guarda no balde `plugga-backups`
do armazenamento da VPS.
Não precisa fazer nada. Para conferir que está funcionando:

```bash
ssh plugga-vps 'tail -5 /var/log/plugga-backup.log'
```

Para forçar um backup agora:

```bash
ssh plugga-vps '/root/backup-plugga.sh'
```

### Backup externo

Além do backup local, existe o **backup externo cifrado** (`ops/backup-externo.sh`): banco
e arquivos de negócio saem da VPS para um bucket B2 privado, cifrados com `age` para dois
destinatários. Formato completo em `specs/002-fundacao-solida/contracts/backup-formato.md`.

```text
b2://<bucket>/diario/AAAA/MM/plugga-os-AAAAMMDDTHHMMSSZ.tar.age
b2://<bucket>/diario/AAAA/MM/plugga-os-AAAAMMDDTHHMMSSZ.manifesto.json
b2://<bucket>/mensal/AAAA/...        # um por mês, retido por 12 meses
```

- **Quem lê:** só quem tem uma chave privada `age`: a do **dono** (guardada offline, nunca na
  VPS) ou a de **teste** (`/root/.plugga-restauracao.key`, só na VPS, para a restauração semanal).
- **Quem escreve:** a VPS, com uma chave do B2 que **só grava**. Quem invade a VPS não apaga nem
  lê o histórico.
- **Segredos:** ficam em arquivo de ambiente de modo 600 (`/root/.plugga-backup-externo.env`),
  nunca na linha de comando.
- **Alerta:** cada rotina manda um ping de sucesso (e `/fail` em erro) ao serviço de
  heartbeat; sem ping em 26 h (diária) ou 8 dias (semanal), o alerta dispara.
- **Prova de que restaura:** `ops/restaurar-teste.sh --externo` baixa o mais recente,
  confere SHA-256 e manifesto, decifra com a chave de teste, restaura num Postgres descartável
  e compara linhas por tabela e objetos por balde. Roda toda semana e registra em
  `/var/log/plugga-restaura-teste.log`.

Ensaios locais (sem VPS, sem Docker, sem B2): `bash ops/backup-externo.test.sh`,
`bash ops/restaurar-teste.test.sh` e `bash ops/instala-agendamentos.test.sh`.

## Recuperação de desastre

Quando usar: a VPS foi perdida ou está irrecuperável. **Metas: voltar em até 4 horas, perdendo
no máximo 24 horas de dados** (o último backup diário).

> Este roteiro foi escrito a partir do formato do backup e dos scripts testados, mas **ainda
> não foi ensaiado com a chave do dono, num servidor limpo e com o B2 real** (tarefa T064).
> Até esse ensaio, o tempo real não é conhecido. Faça o ensaio uma vez, com calma, e anote o
> resultado na tabela do fim desta seção.

**O que você precisa ter em mãos** (antes de começar, não durante o desastre):

1. A **chave privada `age` do dono** (arquivo guardado offline). Sem ela e sem a de teste, o
   backup não abre. Confira agora onde ela está.
2. Uma **chave de leitura do B2** e o nome do bucket (cofre de senhas do dono).
3. Acesso ao repositório `zynox-ia/plugga-os` e ao DNS do domínio.

**Passo a passo**

1. **Servidor novo.** Instale Docker, `git`, `age` e `postgresql-client`. Clone o repositório:

   ```bash
   git clone https://github.com/zynox-ia/plugga-os.git && cd plugga-os
   ```

2. **Arquivos de ambiente.** Recrie o `.env` de produção a partir do cofre de senhas (o modelo
   é o `.env.example`) e o `/root/.plugga-backup-externo.env` com `DESTINO_URL`,
   `DESTINO_LEITURA_URL` e `DESTINO_BALDE`. Modo 600 nos dois.

3. **Baixar o backup mais recente.** Com a chave de leitura, pegue o `.tar.age` e o
   `.manifesto.json` do mesmo nome em `diario/` (ou do `mensal/` se precisar voltar mais).
   Se o último estiver corrompido, use o dia anterior; é o motivo de existirem vários.

4. **Conferir e abrir.** Na pasta dos dois arquivos:

   ```bash
   sha256sum plugga-os-AAAAMMDDTHHMMSSZ.tar.age    # tem de bater com "sha256" do manifesto
   age -d -i /caminho/da/chave-do-dono.key plugga-os-AAAAMMDDTHHMMSSZ.tar.age | tar -x
   ```

   Se o SHA-256 não bater, **pare**: o arquivo foi alterado ou corrompido; use outro dia.

5. **Provar que restaura antes de mexer em produção.** Ainda no servidor novo:

   ```bash
   RESTAURA_CHAVE_AGE=/caminho/da/chave-do-dono.key \
     ops/restaurar-teste.sh plugga-os-AAAAMMDDTHHMMSSZ.tar.age
   ```

   Ele restaura num Postgres descartável e compara tabelas, linhas e objetos com o manifesto.
   Só continue se terminar com `✓ restauração ok`.

6. **Subir a infraestrutura** (`docker compose up -d`: Postgres, Redis, SeaweedFS e criação dos
   baldes) e **restaurar o banco** no Postgres de verdade:

   ```bash
   docker compose cp banco/plugga_os.dump postgres:/tmp/plugga_os.dump
   docker compose exec postgres pg_restore -U plugga_os -d plugga_os --clean --if-exists \
     --no-owner /tmp/plugga_os.dump
   ```

7. **Restaurar os arquivos.** O diretório `arquivos/<balde>/` do pacote tem um espelho de cada
   balde de negócio. Copie cada um de volta ao SeaweedFS com o `mc` (`mc mirror`
   `arquivos/<balde> <alias>/<balde>`), um balde por vez, e confira o número de objetos contra
   `"arquivos"` do manifesto.

8. **Subir o sistema:** `./ops/publicar.sh` (ou `docker compose --profile app up -d`). Confira
   `curl -fsS http://localhost:3001/health` e entre no sistema com um usuário real.

9. **DNS e agendamentos.** Aponte o domínio para o servidor novo e rode
   `ops/instala-agendamentos.sh` para voltar o cron, o Caddyfile e o backup externo. Depois
   de uma noite, confirme que o heartbeat voltou a receber o ping.

10. **Medir e registrar** o tempo total e a idade do backup usado (perda de dados).

**Se faltar a chave do dono:** a chave de teste só existe na VPS; se a VPS se foi, ela foi
junto. Sem a do dono, **não há como abrir o backup**. É por isso que ela precisa de uma
segunda cópia offline em outro lugar.

**Registro dos ensaios**

| Data | Quem | Backup usado (idade) | Tempo total | Resultado |
|---|---|---|---|---|
| (a preencher no primeiro ensaio) | | | | |
