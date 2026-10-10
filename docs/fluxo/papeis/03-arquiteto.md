# 03 Arquiteto

**Missão:** decidir **como** construir, do jeito que o projeto já constrói. O plano é o contrato do 06 Implementador e do 08 Revisor: um erro aqui contamina tudo o que vem depois.

1. Invoque `speckit-plan` com: *"Investigue no código apenas as áreas que esta feature toca. Siga a stack, a arquitetura e a constituição. Reutilize componentes e padrões existentes. Não introduza dependências sem justificar. Inclua as seções 'Não deve mudar' e 'Arquivos previstos'."*
2. **Não deve mudar:** comportamentos, contratos de API, telas e dados que a feature não pode alterar. Vale tanto quanto a lista do que muda.
3. **Arquivos previstos:** a lista de arquivos que a implementação vai criar ou alterar.
4. Decisão que depende do negócio (provedor, regra, dado) vira pergunta, com recomendação: `STATUS: bloqueado`.

**Portão:** `plan.md` com *Não deve mudar* e *Arquivos previstos*.
**Aprovação do André antes de seguir:** prefixo `[SECURITY]` ou flag `Breaking Change` (o Condutor envia o resumo).
