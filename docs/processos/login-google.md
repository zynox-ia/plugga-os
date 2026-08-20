# Login com o Google — configuração, rollout e rollback

Runbook operacional do login federado. A decisão e os seus limites estão no
[adendo 1 do ADR-0008](../adr/0008-auth-self-hosted-single-tenant.md); aqui é o
que precisa ser feito, em que ordem, e o que fazer quando der errado.

Regra de ouro: **o Google prova quem é a pessoa; quem decide se ela entra
continua sendo o banco do cliente.** Nada aqui cria conta, papel ou acesso.

---

## 1. Antes de qualquer coisa: o dono do projeto Google Cloud

O OAuth Client **não pode** ser criado na conta pessoal de quem desenvolve. Se
essa conta sair da empresa, o login de todo mundo cai junto com ela.

Antes de configurar:

- [ ] Definir a conta corporativa dona do projeto Google Cloud.
- [ ] Confirmar quem administra o domínio `plugga.app.br`.
- [ ] Guardar client id e URIs no gerenciador de segredos da VPS, junto com as
      demais variáveis de produção.

O client id é público — vai para o browser de qualquer jeito. Mesmo assim é
**configuração controlada**: ele é a audiência aceita no ID token, e divergir
entre `api` e `web` derruba o login sem que uma linha de código tenha mudado.

---

## 2. Criar o OAuth Client

No Google Cloud Console, projeto da organização:

**Tipo de audiência:** External. Contas Gmail comuns são aceitas no primeiro
vínculo (foi a decisão de produto), e "Internal" restringiria ao Workspace.
Comece em modo *Testing*; publique só depois do smoke da etapa 5.

**Tela de consentimento:**

| Campo | Valor |
|---|---|
| Application homepage | `https://os.plugga.app.br/login` |
| Privacy policy | `https://os.plugga.app.br/privacidade` |
| Escopos | apenas `openid`, `email`, `profile` |

**Credencial → OAuth Client ID → Web application:**

| Campo | Produção | Desenvolvimento (client SEPARADO) |
|---|---|---|
| Authorized JavaScript origin | `https://os.plugga.app.br` | `http://localhost:3000` |
| Authorized redirect URI | `https://os.plugga.app.br/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |

Nenhum escopo de Gmail, Drive, Agenda ou Contatos é pedido — e não deve ser
adicionado: a verificação do app pelo Google muda de categoria no instante em
que um escopo sensível entra.

---

## 3. Variáveis de ambiente

As três precisam existir **nos dois serviços**, `api` e `web`, com os mesmos
valores:

| Variável | Quem usa | Para quê |
|---|---|---|
| `GOOGLE_AUTH_ENABLED` | api + web | Liga a rota e o botão. `false` por default |
| `GOOGLE_OIDC_CLIENT_ID` | api + web | Audiência aceita no ID token / client do botão |
| `GOOGLE_LOGIN_URI` | web consome, api exige e valida | Callback absoluto, igual ao cadastrado |

Ligar a flag sem client id **ou sem callback derruba o boot da API** de
propósito. Subir com a configuração pela metade seria pior do que não ter o
recurso: sem audiência o verificador não tem contra o que comparar `aud`, e sem
callback o botão simplesmente não aparece na tela — a falha mais cara de
diagnosticar, porque nada no sistema reclama.

Em produção a API também recusa um `GOOGLE_LOGIN_URI` que não esteja na mesma
origem de `AUTH_APP_BASE_URL`. Callback e origem divergentes é a falha
operacional número um deste fluxo: o cookie `g_csrf_token` não acompanha o POST
e **toda** tentativa vira "conta não autorizada" — com token, audiência e código
todos corretos.

Não existe client secret neste fluxo. Se alguém pedir um, o desenho foi
confundido com o Authorization Code — não é o que está implementado.

### O `compose.yaml` já declara; o `.env` da VPS é que falta

Até 2026-08-11 o `ops/publicar.sh` e o `deploy.yml` **preservavam o
`compose.yaml` da VPS**, e as três linhas `GOOGLE_*` do repositório não chegavam
lá por deploy nenhum — era preciso editar o arquivo de produção à mão. Isso
acabou: o compose é sincronizado junto com o código, e **as seis linhas chegam
sozinhas**. Não edite mais o compose da VPS; a próxima publicação sobrescreve.

O que continua manual é o `.env`, o único arquivo ainda preservado — ele carrega
segredo real. E um contêiner só enxerga a variável que o `compose.yaml` declara:
o `.env` é lido para expandir `${...}`, e o que o compose não referencia não é
repassado. Como o compose agora referencia as três, basta preencher o `.env`.

Preencha em `/opt/plugga-os/.env` e recrie os dois serviços:

```bash
cd /opt/plugga-os
docker compose config | grep GOOGLE_  # confere o que os contêineres vão receber
docker compose up -d --force-recreate api web
```

Se `docker compose config` não mostrar as três variáveis nos dois serviços, a
VPS está com um compose anterior à sincronização — publique de novo antes de
seguir.

Por que `${VAR:-}` e não a variável crua: com essa forma, um `.env` sem a
variável entrega string vazia em vez de derrubar o compose. O schema de ambiente
trata vazio como ausente exatamente por isso (`opcional()` em
`apps/api/src/config/environment.ts`) — sem esse tratamento, declarar as linhas
no compose antes de preencher o `.env` impediria a API de subir.

---

## 4. Aplicar a migração

A migração `20260817000000_google_identity` é aditiva: cria `user_identities` e
não toca em `users`, `user_credentials`, `sessions` nem `auth_tokens`. Vai junto
com o programa pelo caminho normal:

```bash
./ops/publicar.sh
```

Publique a primeira vez com `GOOGLE_AUTH_ENABLED=false`. A tabela passa a
existir, o botão não aparece e nada muda para quem já usa o sistema.

---

## 5. Rollout

1. **Publicar com a flag desligada.** Confirmar que continuam funcionando:
   login por senha, convite, redefinição de senha, `/auth/me` e logout.
2. **Configurar** o OAuth Client de produção e as variáveis na VPS. Agora é
   **um** arquivo, não dois: os valores no `.env`. As linhas `GOOGLE_*` do
   `compose.yaml` chegam pela publicação desde 2026-08-11 — ver a seção 3.
3. **Ligar para o smoke**, com duas contas que já existam: uma `active` e uma
   `invited` de teste. Antes de tentar entrar, confirme que a configuração
   realmente chegou aos contêineres:

   ```bash
   docker compose exec api printenv GOOGLE_AUTH_ENABLED GOOGLE_OIDC_CLIENT_ID
   docker compose exec web printenv GOOGLE_AUTH_ENABLED GOOGLE_OIDC_CLIENT_ID
   ```

   Os dois têm de responder, e com o MESMO client id. Se algum não responder
   nada, a VPS está com um compose anterior à sincronização — o botão não vai
   aparecer, e nada no sistema vai reclamar.
4. **Validar, nesta ordem:**
   - [ ] a pessoa ativa entra e cai na mesma tela de sempre;
   - [ ] os papéis e as empresas dela estão corretos (`/auth/me`);
   - [ ] um deep link (`/login?redirectTo=/energia-opm/ciclos`) volta ao destino;
   - [ ] logout encerra a sessão;
   - [ ] a convidada entra, vira `active`, e o link de convite antigo deixa de valer;
   - [ ] um e-mail que não existe no sistema é recusado e **nenhuma conta é criada**;
   - [ ] desativar alguém pela tela de Equipe bloqueia também a entrada pelo Google.
5. **Abrir para todos** e observar por 24–48 h: sucessos, recusas, `429`,
   latência do verificador e erros de JWKS.
6. **Publicar o app OAuth** no Google Cloud e registrar quem é o responsável
   operacional.

---

## 6. Rollback

```bash
# na VPS, em /opt/plugga-os
# 1) GOOGLE_AUTH_ENABLED=false no .env
# 2) recriar os dois serviços
docker compose up -d --force-recreate api web
# 3) confirmar que a rota recusa
curl -s -X POST http://127.0.0.1:3001/auth/google \
  -H "content-type: application/x-www-form-urlencoded" \
  --data "credential=x&g_csrf_token=y"
# esperado: {"statusCode":403,...,"code":"disabled"}
```

O passo 3 não é zelo excessivo: o `.env` só desliga se o `compose.yaml` daquele
serviço declarar a variável. Com o compose sincronizado a linha está lá, mas
confirmar custa um comando — e uma VPS que ficou para trás numa publicação
faria o rollback falhar em silêncio.

O que acontece: o botão some da tela e a rota `/auth/google` passa a recusar
qualquer tentativa. O login por senha nunca dependeu disso e continua igual.

**Não apague a tabela `user_identities` nem os vínculos.** São dados aditivos:
nenhum schema anterior depende deles, e removê-los só dificultaria voltar
atrás. Sessões já emitidas podem seguir como sessões normais ou ser revogadas
por usuário, conforme a gravidade do incidente.

Se a suspeita for de client id ou configuração comprometida: recriar o OAuth
Client no Google Cloud, atualizar as variáveis nos dois serviços e revogar as
sessões afetadas no Postgres.

---

## 7. Quando alguém não consegue entrar

A tela mostra sempre a mesma frase para toda recusa — isso é de propósito, para
não revelar a quem está de fora se aquela conta existe aqui dentro. O motivo
real fica na trilha:

```sql
SELECT occurred_at, entity_id, payload
FROM events
WHERE event_name = 'auth.login.failed'
  AND payload->>'method' = 'google'
ORDER BY occurred_at DESC
LIMIT 20;
```

| `payload.reason` | O que aconteceu | O que fazer |
|---|---|---|
| `user_not_found` | O e-mail da conta Google não existe no plugga-os | Convidar a pessoa pela tela de Equipe |
| `user_not_eligible` | A conta local está `disabled` | É o comportamento correto; reativar é decisão administrativa |
| `email_not_authoritative` | Conta Google feita sobre e-mail de terceiro (sem Gmail e sem Workspace) | A pessoa entra por senha; use "Esqueceu a senha?" |
| `email_not_verified` | O Google não confirmou o e-mail | A pessoa resolve na conta Google dela |
| `identity_conflict` | O `sub` já é de outra pessoa, ou esta pessoa já tem outra conta Google | **Olhar manualmente**: é sinal de conta duplicada ou de tentativa de tomada de conta |
| `identity_email_conflict` | O e-mail da conta Google passou a ser o de outro usuário local | **Olhar manualmente** antes de mexer em qualquer vínculo |
| `invalid_token` | Token inválido, expirado ou de outra audiência | Conferir se `GOOGLE_OIDC_CLIENT_ID` bate entre `api`, `web` e Google Cloud |
| `invalid_csrf` | O cookie `g_csrf_token` não chegou ou não bate | Quase sempre é o callback cadastrado divergindo do domínio real |
| `verifier_unavailable` | Não deu para falar com o Google | Temporário; o login por senha continua funcionando |
| `feature_disabled` | A flag está desligada em algum dos serviços | `docker compose exec api printenv GOOGLE_AUTH_ENABLED` e o mesmo para `web`. Sem resposta = a VPS está com um compose anterior à sincronização, e o problema não é o `.env` |

Nem o ID token nem o `sub` do Google aparecem em log, evento ou URL — nunca. Se
algum dia aparecerem, é defeito, não dado de diagnóstico.

Um vínculo pode ser conferido assim (o `sub` fica no banco, e só nele):

```sql
SELECT u.email, i.email_at_link, i.last_observed_email, i.hosted_domain, i.last_login_at
FROM user_identities i
JOIN users u ON u.id = i.user_id
WHERE u.email = 'pessoa@exemplo.com.br';
```

Desfazer um vínculo (a pessoa perdeu a conta Google, por exemplo) é apagar a
linha; ela volta a entrar por senha e pode vincular outra conta no próximo login:

```sql
DELETE FROM user_identities WHERE user_id = '<uuid>' AND provider = 'google';
```
