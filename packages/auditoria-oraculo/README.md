# @plugga/auditoria-oraculo

Oráculo normativo da auditoria de eficiência energética. **Tooling e teste — nunca runtime de produção.**

`referencia/` é uma cópia byte a byte do pacote `plugga-auditoria-energetica-COMPLETO-2026-08-09`: 141 arquivos normativos, entre PRD, motores Python, casos, planilhas e o modelo HTML aprovado. Ela existe para ser lida e comparada, não executada em produção. Nenhum pacote de `apps/` depende deste — e há teste garantindo isso.

## Por que existe

O port TypeScript da auditoria (V2) precisa ser fiel a uma especificação que já é executável. O Python do pacote é essa especificação: em desenvolvimento e em CI ele roda ao lado do TypeScript sobre a mesma entrada, e o harness compara campo a campo. Em produção só existe TypeScript; a ausência de Python não muda o caminho produtivo.

## Manifesto

```
pnpm --filter @plugga/auditoria-oraculo manifesto:verificar
pnpm --filter @plugga/auditoria-oraculo manifesto:gerar     # só com aprovação
```

O manifesto cobre os 141 arquivos normativos com caminho, tamanho e SHA-256. Ficam de fora, declaradamente, `.DS_Store` e `__pycache__`: o primeiro é lixo do Finder, o segundo é gerado pela própria execução do oráculo — se entrasse no manifesto, rodar o Python invalidaria a árvore que ele acabou de ler.

Regravar o manifesto é uma decisão, não um conserto. Só faz sentido quando o pacote normativo foi trocado de propósito, e o commit precisa dizer qual aprovação autorizou.

## Golden

O caso golden do pacote é **Santa Tereza**, regenerado por `teste_regressao.py` e conferido por MD5 em desktop e celular. O `modelo-aprovado-cliente-serra-verde-2025-06-b.html` é o **template congelado**, não uma saída regenerável — o pacote não traz fatura nem caso de motor do Serra Verde, apenas o `.md` descritivo. Ele é provado pelo hash do arquivo.

Antes de qualquer comparação contra o TypeScript, o oráculo prova a si mesmo: se ele não fechar o próprio golden, o diff não significa nada.

## Rodar o oráculo

```
RUN_ORACULO_TESTS=true pnpm --filter @plugga/auditoria-oraculo test
```

Exige `python3` na versão fixada em `src/oraculo.ts` (a TIR é bisseção própria e todo valor passa por `round()` sobre float; trocar de versão pode mover centavos). A execução acontece sempre em workspace temporário, com `PYTHONDONTWRITEBYTECODE=1`, e a árvore congelada permanece intacta — o que também é testado.

## Divergências

`src/divergencias.ts` registra as diferenças aprovadas entre o oráculo e o TypeScript. A regra é simples: ou os dois lados coincidem, ou a diferença está registrada com fonte, decisão, impacto e aprovação. Divergência não registrada reprova o harness, bloqueia CI e impede promover a feature flag.
