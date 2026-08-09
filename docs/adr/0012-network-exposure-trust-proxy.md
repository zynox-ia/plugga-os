# ADR-0012 — Exposição de rede: bind privado, `trust proxy` explícito e X-Forwarded-For validado

- Status: Aceito · Data: 2026-08-09 (registro retroativo; decisão aplicada no código desde o Bloco B) · Decisores: equipe Plugga OS · Contexto do bloco: Bloco B (auth real em produção)

> **Nota de registro.** Esta decisão foi tomada e implementada durante o Bloco B
> — `main.ts`, `configure-app.ts`, `forwarded-for.ts`, `compose.yaml`, os dois
> Dockerfiles e o `.env.example` já a citavam como "ADR-0012" — mas o documento
> nunca foi escrito. Este texto reconstrói a decisão a partir do código e dos
> comentários existentes; não introduz comportamento novo.

## Contexto

O rate limiting por IP em `/auth/*` e o lockout por e-mail (ADR-0008) só
funcionam se a API souber o IP real do cliente. Esse conhecimento atravessa três
topologias diferentes:

1. **`pnpm dev`** — web e API no mesmo host; a API escuta em `127.0.0.1` e o
   único hop é loopback.
2. **Compose com `--profile app`** — web e API em containers separados; a
   requisição chega à API pelo IP da bridge do Compose.
3. **Produção (VPS)** — Caddy na frente do web, web na frente da API.

`X-Forwarded-For` é um header que o cliente controla, a menos que um proxy
confiável o **sobrescreva**. Confiar nele por padrão permitiria burlar teto e
lockout rotacionando o valor. Não confiar nunca faria todo o tráfego de produção
cair num balde só. Os dois erros são silenciosos — é o pior tipo.

## Decisão

1. **O bind é a fronteira fora de container; a rede do Compose é a fronteira
   dentro dele.** A API escuta em `127.0.0.1` por padrão (`main.ts`). Em
   container, `HOST=0.0.0.0` é fixado pelo `compose.yaml` porque ali a proteção
   passa a ser a rede interna e a porta publicada presa a `127.0.0.1` — o bind
   deixa de ser o que protege (`apps/api/Dockerfile`, `compose.yaml`).
2. **`trust proxy` é uma escolha explícita, nunca um default permissivo.**
   `TRUST_PROXY` aceita os valores do Express (`loopback`, contagem de hops,
   IP/CIDR, `false`/`true`) e nasce como `loopback` — correto apenas enquanto
   todo processo divide um host. `true` (confiar em qualquer cadeia) é aceito
   mas avisa alto no boot (`configure-app.ts`).
3. **O web só repassa `X-Forwarded-For` sob opt-in e depois de validar.**
   Route handlers do App Router não enxergam o socket, então o valor só pode ser
   retransmitido, nunca re-derivado. `WEB_TRUST_PROXY=false` por padrão: sem um
   reverse proxy que sobrescreva o header, repassar seria dar o controle ao
   cliente. Só um endereço único e bem-formado é repassado; cadeia multi-hop é
   descartada (`apps/web/app/lib/forwarded-for.ts`).
4. **A configuração de produção é a que os testes exercitam.** `configureApp`
   (cookie assinado, `trust proxy`) vive num módulo compartilhado entre o
   `main.ts` e a suíte e2e, para que apagar uma proteção do bootstrap deixe a
   suíte vermelha (`configure-app.ts`, `apps/api/test/auth.e2e.spec.ts`).

## Consequências

- **Positivas:** nenhum caminho em que o cliente controla o próprio IP visto
  pela API; degradação segura (balde único) quando a topologia não dá garantia;
  a suíte e2e falha se a configuração real for removida.
- **Negativas:** no Compose com `--profile app` sem `WEB_TRUST_PROXY`, o rate
  limit por IP vira um balde compartilhado (documentado no README) — o lockout
  por e-mail é a defesa que sobrevive a qualquer topologia.
- **Neutras:** cutover para staging/prod exige configurar `TRUST_PROXY` e
  `WEB_TRUST_PROXY` em conjunto com o reverse proxy real (checklist no README).

## Alternativas consideradas

- **`trust proxy: true` por padrão** — rejeitada: reabre o bypass por header.
- **Derivar IP no web via socket** — inviável no App Router sem servidor
  custom; sairia do trilho do Next.
- **Rate limit só por e-mail, sem IP** — rejeitada: o teto por IP protege
  também os endpoints que não têm e-mail (ex.: `/auth/login` com e-mails
  aleatórios).

## Gatilhos de revisão

- Web deixar de ser o único processo na frente da API (novo gateway, CDN).
- Migração do App Router ou adoção de servidor custom no Next.
- Qualquer mudança em como o Caddy da VPS trata `X-Forwarded-For`.

## Guardas de escopo (o que este ADR NÃO autoriza)

- Expor a API fora de `127.0.0.1`/rede do Compose sem decisão explícita.
- `TRUST_PROXY=true` em staging/prod.
- Repassar cadeias multi-hop de `X-Forwarded-For`, mesmo com proxy confiável.
