# Tickets de Segurança

## SEC-001 - Corrigir vulnerabilidades de dependências

- Prioridade: P0
- Status: implementado
- Escopo: atualizar dependências diretas e transitivas apontadas por `pnpm audit --prod`; o audit atual reporta 1 crítica, 15 altas, 11 moderadas e 1 baixa.
- Aceite: `pnpm audit --prod` retorna zero vulnerabilidades e a CI bloqueia novas vulnerabilidades de produção de severidade alta ou crítica.

## SEC-002 - Headers de proteção no web

- Prioridade: P0
- Status: implementado
- Escopo: CSP restritiva, HSTS apenas em produção, proteção contra framing, `nosniff`, política de referrer e permissões do browser.
- Aceite: login, Google e Spline carregam sob CSP; a aplicação não pode ser embutida por outro site.

## SEC-003 - Isolar a animação Spline

- Prioridade: P0
- Status: implementado
- Escopo: limitar o iframe Spline a scripts e impedir o envio de referrer; respeitar redução de movimento.
- Aceite: animação continua visualmente funcional, não recebe URL de reset e some sob `prefers-reduced-motion`.

## SEC-004 - Invalidar tokens de autenticação anteriores

- Prioridade: P0
- Status: implementado
- Escopo: ao reenviar convite ou reset, substituir qualquer token pendente do mesmo usuário e tipo.
- Aceite: o link anterior retorna token inválido; somente o mais recente funciona.

## SEC-005 - Rejeitar trust proxy amplo em produção

- Prioridade: P0
- Status: implementado
- Escopo: bloquear `TRUST_PROXY=true` em produção e exigir hop ou CIDR explícito.
- Aceite: boot em produção falha de forma explícita para a configuração insegura.

## SEC-006 - Persistir proteção contra abuso no Redis

- Prioridade: P1
- Status: pendente
- Escopo: mover limites de login/reset de memória para Redis e incluir cooldown por destinatário de reset.
- Aceite: limites sobrevivem a restart e a múltiplas instâncias da API.

## SEC-007 - Isolar CI com dados de corpus

- Prioridade: P1
- Status: parcialmente implementado
- Escopo: impedir que pull requests executem código no runner self-hosted com acesso ao corpus.
- Aceite: o job `corpus` só executa em `push` na `main`; actions e imagem Gitleaks são fixadas por SHA validado.
