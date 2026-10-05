# Pesquisa e decisões: Fundação sólida

Cada decisão traz recomendação, motivo e alternativas. As marcadas **(dono)** dependem de escolha do dono; as demais são técnicas e seguem a recomendação se não houver objeção.

## D1. Publicação segura (US1) **(dono)**

**Problema.** `deploy.yml` dispara por `workflow_run` filtrando só `branches: [main]`, que compara o *head_branch* do CI que disparou. Um PR de fork com branch `main` produz um CI com essa branch. O passo seguinte faz checkout do `head_sha` e roda `sudo rsync` e `sudo deploy.sh`. O runner `self-hosted` roda como usuário com `sudo` sem senha na própria VPS de produção, e o job `corpus` do `ci.yml` (disparado por PR) usa o mesmo runner.

**Recomendação em duas etapas.**

1. *Fatia 1 (sem custo, sem nova infraestrutura):*
   - Condição do job: `conclusion == 'success'` e `event == 'push'` e `head_repository.full_name == github.repository` e `head_branch == 'main'`.
   - Ambiente `production` com revisores obrigatórios (aprovação humana antes de tocar a VPS).
   - `permissions: contents: read`, `concurrency: deploy` (sem cancelar), `timeout-minutes`.
   - Pular se o `head_sha` não for mais a ponta da `main`.
   - `CODEOWNERS` e proteção da `main`.
   - Tirar do runner da VPS os jobs disparados por PR.
2. *Fatia 4:* o deploy passa a ser feito por SSH, a partir de um runner hospedado pelo GitHub, com uma chave cujo `authorized_keys` tem **comando forçado** (`command="/opt/plugga-os/ops/deploy-entrada.sh"`, sem shell, sem encaminhamento). O runner self-hosted deixa de existir na VPS. O `sudo` sem senha some.

**Alternativas.**
- *Runner dedicado em outra máquina.* Isola a CI, mas ainda precisa de um caminho de deploy para a VPS e adiciona uma máquina para manter.
- *Só endurecer o runner atual.* Resolve o caso de fork, mas deixa qualquer colaborador com escrita capaz de agendar job com `sudo` na produção.

**Ponto aberto.** O job `corpus` precisa ler o balde de corpus que mora na VPS. Opções: (a) rodar só em `push` na `main` e em agenda, num runner sem `sudo`; (b) exportar o corpus para um local acessível ao runner hospedado, com chave só de leitura. Recomendo (a) na fatia 1 e reavaliar na fatia 4.

**Pergunta ao dono (P4).** O repositório é público ou aceita forks? Muda a urgência, não a correção.

## D2. Scanner de dados de cliente (US2) **(dono: lista de nomes)**

**Recomendação.** Script próprio em Node (`scripts/scan-dados-cliente.mjs`), rodando no CI e opcionalmente como `pre-commit`:

- CNPJ e CPF, com e sem pontuação, **validando o dígito verificador**; só os que passam são achados.
- Padrões de unidade consumidora (formatos usados nos casos e templates, por exemplo `uc-<número>` e `UC 0000000-0`, sempre com números sintéticos).
- Nomes de clientes lidos de variável de ambiente (`CLIENT_NAMES_FILE` ou segredo `CLIENT_NAMES`), nunca versionados; comparação sem acento e sem diferença de caixa.
- Lista de **permitidos** para fixtures sintéticas declaradas (arquivo no repositório com valores sintéticos conhecidos).
- Relatório lista arquivo, linha e tipo, **sem imprimir o valor**, para não vazar o dado no log da CI.
- `gitleaks` continua sendo o detector de segredos; os dois rodam.

**Fixtures sintéticas.** Gerador determinístico (`scripts/gera-fixtures-sinteticas.mjs`) produz CNPJs/CPFs com dígito verificador válido a partir de uma semente fixa, nomes fictícios e números de UC fictícios, e escreve a lista de permitidos junto. Como o formato e as faixas de valor são preservados, os testes de regressão do leitor de fatura continuam cobrindo os mesmos comportamentos.

**Risco conhecido.** Um CNPJ sintético com dígito válido pode, por coincidência, ser de uma empresa real. A lista de permitidos garante que o scanner o reconheça como sintético; o gerador usa uma faixa de base reservada e documentada para reduzir a chance. Aceitável porque o dado não identifica um cliente da Plugga.

**Alternativas.**
- *`gitleaks` com regras customizadas.* Não valida dígito verificador; marcaria IDs, datas e protocolos. Seria desligado em pouco tempo.
- *`trufflehog` ou serviço comercial de DLP.* Mais pesado e com custo; o problema é estreito.

## D3. Backup externo (US3) **(dono: conta B2 e chaves)**

**Contexto.** O volume é pequeno (banco em torno de 0,5 MB por dump, dezenas de MB de arquivos). O destino é o Backblaze B2 (decisão do dono).

**Recomendação.** Um arquivo diário por dia, criptografado com **`age`** usando só chaves públicas, enviado ao B2 com **Object Lock** (modo governança, 35 dias) e regra de expiração.

- *Conteúdo:* `pg_dump -Fc` mais cópia dos baldes de negócio (`plugga-energia-opm`, `{empresa}-financeiro`, `waze-engenharia-obras` etc.) mais um `manifesto.json` (contagem de tabelas e de arquivos, SHA-256 de cada arquivo).
- *Chaves:* a VPS tem **apenas as chaves públicas** (dono, offline; e a de restauração de teste). Quem invade a VPS consegue criar backups, não consegue ler os antigos do B2 sem a chave privada, e a chave de aplicação do B2 da VPS é **só de escrita** (sem apagar). A chave privada do dono fica fora da VPS e fora do B2.
- *Retenção:* diário por 35 dias; o primeiro de cada mês é copiado para um prefixo com retenção de 12 meses.
- *Restauração semanal:* `ops/restaurar-teste.sh` baixa o mais recente com uma chave de aplicação **só de leitura**, confere SHA-256 e manifesto, descriptografa com a chave de teste, restaura o banco num contêiner descartável em rede isolada e compara contagens. A chave de teste fica na VPS (root, modo 600). Isso permite automação sem expor a chave de recuperação do dono. Como quem tem root na VPS já alcança o banco vivo, a chave de teste não amplia o dano.
- *Alerta:* ver D4.

**Alternativas.**
- *`restic`.* Melhor quando o volume passa de alguns GB (deduplicação, `forget --prune`). Para pequenos volumes, o `prune` precisa de chave com permissão de apagar, o que conflita com Object Lock e com a chave só de escrita. Reavaliar acima de ~5 GB.
- *`rclone crypt`.* Simples, mas sincroniza em vez de manter pontos imutáveis, e uma remoção na origem chega ao destino.
- *Restauração semanal em runner hospedado do GitHub.* Isola mais, mas leva o dado real de produção para a infraestrutura do GitHub, o que a constituição (princípio III) desaconselha.

**Perguntas ao dono.** P1 (conta e chaves), P2 (chave privada `age`, onde guardar e quem tem cópia).

## D4. Alerta e monitor externo **(dono: contas)**

**Recomendação.**
- *Heartbeats (dead-man switch):* `healthchecks.io`. O backup, a restauração semanal e uma checagem local de prontidão (`curl` ao `/health/ready` na própria VPS) enviam ping de sucesso; falha ou silêncio acima do prazo (26 h para o backup diário) dispara alerta **por e-mail do próprio serviço**.
- *Monitor HTTP:* um monitor externo gratuito (UptimeRobot ou Better Stack) em `https://os.plugga.app.br/`, com alerta por e-mail e, se o dono quiser, aplicativo de celular.
- O canal de alerta **não pode depender do sistema monitorado**, por isso não usa o Brevo do Plugga OS. Telegram e WhatsApp ficam de fora (constituição I).

**Alternativas.** Uptime Kuma na própria VPS (cai junto com a VPS, derrota o propósito); e-mail via Brevo do sistema (depende do que se quer monitorar).

## D5. Rastreamento de erros (fatia 4)

**Recomendação.** Sentry em nuvem (plano gratuito), com `sendDefaultPii: false`, sem corpo de requisição, filtro `beforeSend` que remove cabeçalhos, cookies, e-mails, documentos e valores; `requestId` como tag. Tem DPA e é o menor custo operacional na VPS de 8 GB.

**Alternativas.** GlitchTip self-hosted (exige Postgres, Redis e worker próprios; sugerido na outra VPS se o dono não quiser dado de erro fora do país); só log estruturado com busca manual.

## D6. Rota fechada por padrão (US5)

**Desenho.**
- Marcadores em `core/auth`: `@Public()` (rota pública), `@Roles(...)` (já existe) e `@Authenticated()` (qualquer usuário logado, declarado de propósito).
- `APP_GUARD` global, em ordem: `SessionAuthGuard` (renome de `DevAuthGuard`; pula rotas `@Public()`), depois `RolesGuard` **fail-closed**: sem `@Public()`, `@Authenticated()` ou `@Roles()`, nega.
- Rotas públicas aprovadas (hipótese a confirmar no inventário): saúde, login, convite, redefinição de senha, retorno do Google.
- O guard por rota que já existe (`OriginCheckGuard`, `ThrottlerGuard`) continua. Guards globais rodam antes dos de rota no Nest.
- **Inventário versionado** ([contracts/inventario-rotas.md](contracts/inventario-rotas.md)): um teste sobe o app, lista método, caminho, declaração e papéis, e falha se a lista divergir do arquivo aprovado. Mudar a lista de públicas exige revisão do dono (CODEOWNERS).
- O atalho de desenvolvimento (`DevHeaderAuthContext`) só é registrado se o ambiente for local ou de teste, além da checagem de `NODE_ENV` que já existe.

**Faseamento.** Fatia 1: guard global em modo **aviso** (log, sem negar) e inventário. Fatia 2: imposição, com variável de retorno (`ROUTE_GUARD_MODE=warn|enforce`) para voltar sem nova publicação em caso de rota legítima esquecida.

**Alternativas.** Reescrever cada controller (140 pontos de mudança, regressão provável); só teste de inventário sem guard (detecta, não impede).

## D7. Escopo único de empresa (US4)

**Achado.** O banco já guarda papel por empresa (`user_company_roles`). O defeito é `flattenRoles` + `RolesGuard`, que ignoram a empresa. O que falta é `company_id` nos dados de negócio e a checagem na leitura.

**Desenho.**
- `CompanyScope` em `core/auth`: dado um principal, devolve `{ empresas: CompanyKey[], papeisPorEmpresa }`; admin de plataforma alcança as duas (regra de leitura, como hoje).
- `RolesGuard` passa a decidir **com a empresa do registro**: papel exigido precisa existir na empresa do recurso. Rotas sem recurso de empresa (listagens) usam as empresas do escopo.
- Auxiliar de repositório `escopoDe(principal)` devolve o fragmento `where: { companyId: { in: [...] } }` e um `exigirEmpresa(registro, escopo)` para escrita; os repositórios de Compras e Obras adotam e as duas classes de escopo duplicadas são removidas.
- **Matriz de isolamento** (teste): para cada repositório de módulo de negócio, usuários A e B com o mesmo papel em empresas diferentes tentam cada operação sobre registros um do outro; todas devem falhar com "não encontrado".
- **Guard e registro.** O guard roda antes de o registro ser carregado e por isso não conhece a empresa de um `:id`. Decisão em duas camadas: o `RolesGuard` exige o papel em *alguma* empresa do escopo; o service confere `rolesByCompany[registro.companyId]` depois de carregar; o repositório filtra por empresa na leitura (`NAO_ENCONTRADO` para empresa fora do escopo) e a criação valida a empresa do corpo contra o escopo.
- Concessão: `team.service` só permite conceder papel e empresa que o concedente administra (já há parte disso; completa-se a regra de empresa).

**Alternativas.**
- *Extensão do cliente Prisma que injeta o filtro.* Menos código por repositório, mas esconde o filtro, falha em `findUnique` e dificulta o raciocínio sobre transações.
- *RLS no Postgres.* O ADR-0003 escolheu autorização na aplicação para manter o ORM portável; reverter exige novo ADR e muda o papel de banco.

**Pendência com o ADR-0013.** O ADR cita a migração das tabelas de acesso. O plano propõe **não fazer isso na spec 002**: o que muda é o guard e os dados. A spec 003 adapta a tela. Confirmar com o ARCHITECT e anotar no ADR.

## D8. Migrações aditivas (fatia 3)

- **Expandir antes de contrair.** Primeira publicação: coluna nova nula e código que escreve nos dois formatos. Segunda: preencher. Terceira: impor `NOT NULL`/restrição. Só então remover o formato antigo.
- **Restrições sem bloquear:** `ADD CONSTRAINT … NOT VALID`, depois `VALIDATE CONSTRAINT`. Índices normais enquanto as tabelas forem pequenas (limite documentado: abaixo de 100 mil linhas); acima disso, índice criado fora da transação do Prisma, por script.
- **Reversão.** Cada migração tem `rollback.sql` ao lado (não executado automaticamente). A CI aplica todas as migrações do zero, depois o `rollback.sql` da última e confere que o esquema volta ao anterior. Colunas novas e nulas são inofensivas para a versão antiga do código.
- **Backup restaurado antes** de cada migração na VPS (T053 comprova o procedimento).
- **Deriva.** `prisma migrate diff --exit-code` na CI, com lista explícita de exceções para os índices únicos parciais escritos à mão (`pedidos_de_compra_etapas_uma_aberta_por_pedido`, `obra_etapas_historico_uma_aberta_por_obra`).
- **Duplicatas.** Antes de qualquer índice único, um script de leitura lista as duplicatas; o dono decide cada caso; só então a restrição é aplicada.

## D9. Reescrita de histórico (US2) **(dono: aprovou a opção A)**

**Estado.** Pacote git de 10 MiB; reescrita leva minutos. O custo é humano.

**Procedimento.**
1. Pré-requisitos: todos os PRs em andamento mergeados ou abandonados (P5); comunicado a quem tem clone ou fork; janela combinada.
2. Congelar a `main` (regra de proteção "bloquear criações e atualizações") e desligar o deploy automático durante a operação.
3. Clone espelho novo (`git clone --mirror`). Guardar uma cópia offline e criptografada por 30 dias (reversão).
4. `git filter-repo` com `--path` dos arquivos a remover e `--replace-text` para valores que precisam ser substituídos dentro de arquivos que permanecem.
5. Varrer o espelho reescrito com o scanner (histórico inteiro, todas as branches e tags): 0 ocorrências.
6. `git push --force --mirror` (a regra de proteção é suspensa só por esse passo e restabelecida em seguida).
7. Abrir pedido ao suporte do GitHub para remover `refs/pull/*` e o cache de visualização dos commits antigos (os PRs antigos mantêm os blobs até esse pedido).
8. Todos refazem o clone; o runner da VPS também; fork e clones antigos são tratados como já expostos.
9. Descongelar; reativar o deploy; registrar data e hash novo do HEAD no GUIA.

**Efeitos.** Todos os hashes mudam; PRs abertos precisam ser refeitos; referências em issues e ADRs a hashes antigos deixam de resolver (as ADRs citam poucos; revisar).

**Alternativas.** `BFG Repo-Cleaner` (mais simples, menos flexível em substituição de texto); apenas remover da árvore (rejeitado pelo dono).

## D10. Limites de upload, OCR e execução assíncrona (US10)

**Limites antes de processar:**
- Contagem de páginas lida do cabeçalho do PDF (sem extrair texto) e recusa acima do teto (hoje 3 para faturas); extração só até o teto.
- Dimensão da página e da imagem: recusa acima de um teto em pixels (proposta: 4.000 × 4.000 após a escala de 200 DPI; documentar) **antes** de criar o canvas.
- Tipo por **bytes mágicos** (PDF, PNG, JPEG, TIFF, XLSX) e não por `mimetype` declarado, em Faturas, Compras e Obras.
- `multer` com armazenamento em disco temporário, teto por arquivo e **teto total por requisição** (proposta: 25 MB por arquivo, 60 MB por requisição), e limite de envios simultâneos por usuário.
- Tempo máximo de leitura e de OCR, com cancelamento.
- Mensagens ao usuário sem detalhe interno (sem repassar `erro.message` do S3 ou do parser).

**Assíncrono (fatia 4):** leitura de fatura, chamada de LLM e geração de PDF viram jobs BullMQ (a fila e o processo de trabalho já existem para o Bitrix) com estado consultável (`queued`, `running`, `done`, `failed`) e idempotência por hash do arquivo. Até lá os limites acima já protegem o processo.

**Alternativas.** Manter síncrono com limites (aceitável como etapa intermediária); serviço de OCR separado (complexidade fora do porte atual).

## Itens que a auditoria marcou como não verificados

Entram como **primeira tarefa** da história correspondente, antes de qualquer correção:
- O Next.js decodifica `%2F` em `params` das rotas de API? (US12; muda a gravidade, não a correção.)
- A produção define `WEB_TRUST_PROXY` e `TRUST_PROXY` atrás do Caddy? (US11; define se o limite de login global já está resolvido.)
- Quais valores de segredo a produção usa (exemplo ou gerados)? (US11; checar sem imprimir o valor.)
- `prisma migrate diff` mostra remoção dos índices únicos parciais? (US9.)
- O `consumo.controller.ts` injeta sem `@Inject` e funciona sob Vitest/esbuild? (US16.)
- O repositório é público ou aceita forks? (US1, P4.)

## Itens verificados

Resultado da verificação dos itens acima (T008), feita em 2026-10-05 sobre o código da `main` e uma instância local. Nada aqui imprime segredo.

| # | Item | Resultado | Como foi verificado |
|---|---|---|---|
| a | O Next.js decodifica `%2F` em `params` das rotas de API? | **Sim.** `/api/x/a%2Fb` entrega `id = "a/b"`, e `a%2e%2e%2fb` entrega `a../b`. Só `%252F` não é decodificado. Como as rotas de proxy montam o caminho da API por interpolação (`pedidos/${id}/necessidade`), um `id` malicioso muda o caminho chamado na API. **A US12 mantém a gravidade e a correção** (validar o formato do id e usar `encodeURIComponent`). | Rota temporária no `apps/web` (Next 15.5.24, `next dev`) e `curl`; a rota foi removida. |
| b | A produção define `WEB_TRUST_PROXY` e `TRUST_PROXY` atrás do Caddy? | **Não verificável daqui.** O padrão no `compose.yaml` é `WEB_TRUST_PROXY=false` e `TRUST_PROXY=loopback`. O valor real está no `.env` da VPS, que esta sessão não lê. **Fica para o dono ou para uma tarefa `[VPS]` com aprovação** (conferir só se a variável existe e o valor, sem imprimir outros segredos). | Leitura do `compose.yaml` e de `apps/web/app/lib/forwarded-for.ts`. |
| c | Os segredos de produção são os valores de exemplo? | **Não verificável daqui**, pelo mesmo motivo. **Fica para o dono ou `[VPS]`**: comparar o hash dos segredos com o dos exemplos, sem imprimir. | Não há acesso ao `.env` da VPS. |
| d | `prisma migrate diff` quer remover os índices únicos parciais? | **Não.** O diff entre as migrações e o `schema.prisma` saiu vazio ("This is an empty migration"). O Prisma não enxerga índice parcial, então ele não propõe removê-los; o risco é de quem gerar uma migração nova esquecendo-os, o que a US9 trata com a regra de revisão. | `prisma migrate diff --from-migrations --to-schema-datamodel` com um Postgres 16 local e banco sombra. |
| e | O `consumo.controller.ts` injeta sem `@Inject` e funciona sob Vitest/esbuild? | **Não funciona sob Vitest.** Sem `@Inject(ConsumoService)`, o campo `consumo` fica `undefined` num módulo de teste (o esbuild não emite metadados de decorador). **Em produção funciona**, porque o `nest build` usa o `tsc`, que emite os metadados. Nenhum teste existente sobe o `LlmModule`, por isso ninguém viu. A US16 acrescenta o `@Inject` e um teste. | Teste temporário com `Test.createTestingModule`; removido depois. |
