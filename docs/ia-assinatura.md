# IA pela assinatura (Claude e Codex)

Claude e Codex podem ser usados pela assinatura de uma pessoa, por um proxy de CLI
([CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)), em vez de por chave de API. É uma
escolha do André. Este documento diz o que está montado e as regras de projeto.

## Regras de projeto

1. **Só tarefa interna, sem dado de cliente.** Fatura, cadastro de cliente e qualquer fluxo com
   dado pessoal usam o OpenRouter, com roteamento sem retenção (`apps/api/src/llm`). O módulo
   `ia-assinatura` **não exporta o serviço**, e um teste (`assinatura-ia.spec.ts`) falha se
   qualquer arquivo fora dele o importar.
2. **Só desenvolvedor.** Rotas `@Plataforma("desenvolvedor")`. O início do login e a remoção de
   conta geram evento de auditoria, com quem e quando.
3. **O Plugga OS nunca vê o token.** Quem guarda o login é o proxy, no volume dele
   (`cliproxy_auth`). A API só pede o link de login, acompanha o resultado e lista ou remove contas.

## Contexto, para quem for mexer

- **Claude:** a [documentação legal do Claude Code](https://code.claude.com/docs/en/legal-and-compliance)
  não permite rotear requisições por credenciais de plano (Pro, Max) em sistemas de terceiros e
  reserva à Anthropic o direito de agir sem aviso. O caminho oficial é a chave de API do Console.
- **Codex:** a [documentação da OpenAI](https://learn.chatgpt.com/docs/auth) recomenda chave de API
  para automação e trata o `auth.json` como senha.
- **Proxy de terceiros** guardando tokens de assinatura: fixe a imagem por tag ou digest revisado
  (`CLIPROXY_IMAGE`) e mantenha as portas só em `127.0.0.1`.

## Subir o proxy (uma vez por máquina)

```bash
node scripts/cliproxy-config.mjs                      # gera .local/cliproxy/config.yaml e CLIPROXY_* no .env
docker compose --profile ia-assinatura up -d cliproxy # sobe só o proxy
```

Reinicie a API depois (`pnpm dev`) para ela ler as variáveis `CLIPROXY_*`. Em Configurações →
Desenvolvedor → Integrações, os cartões **Claude** e **Codex** conduzem o login.

O retorno do login volta ao navegador da própria máquina nas portas **54545** (Claude, documentada)
e **1455** (Codex, padrão do login do Codex; confirmar na primeira vez). Por isso o login precisa ser
feito no navegador do computador onde o proxy roda; numa VPS, use um túnel SSH para essas portas.

## O que não foi verificado

O formato exato da resposta de `GET /v0/management/auth-files` e as chamadas de login foram
escritos pela documentação do proxy, sem rodar o login real (exige conta). O adaptador é defensivo e
um teste cobre cada forma esperada; o primeiro login real confirma.
