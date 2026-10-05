# Realinhamento da spec 003 com a conversa da sessão anterior

Data: 2026-10-05. Fonte: transcrição inteira da sessão "Migração para GitHub Spec Kit" (do pedido inicial às 17:10 até o adendo das 17:46). Status da spec: **rascunho, aguardando aprovação do dono**.

## O que o dono combinou (e a spec 003 mantém)

| Combinado | Onde está agora |
|---|---|
| Um ecossistema só; módulos únicos por função (Comercial/CRM e Clientes, Compras, Financeiro, Energia, Engenharia/Obras, Eletromobilidade, Equipe) | US1, FR-001 |
| Empresa é etiqueta do registro; cliente e fornecedor únicos | US3, US4, US5 |
| Quem tem uma empresa só nem vê o seletor | FR-006 |
| Seletor removido; filtros separados e estabelecidos em cada tela (adendo do ADR-0013) | US2, FR-005 a FR-009 |
| Cadastro de cliente visível a quem tem papel comercial; negócios filtrados pela empresa | FR-013 |
| Lançamento financeiro exige empresa; fornecedor único | FR-017 a FR-019 |
| Segurança primeiro (002), produto depois (003) | Contexto da spec, plano, T315 |

## O que mudou no realinhamento

1. **Ordem**: menu e filtros só entram em uso depois de 002 T145 e T150.
2. **Seletor**: a chave vale só para o menu; o seletor sai de vez quando os filtros estiverem em uso (T328), sem modo duplo nos testes.
3. **Dashboard**: só filtro de empresa e aviso de exemplo; sem módulo de API de agregação (T356, T359 removidas).
4. **Links antigos**: redirecionam por 90 dias; sem página "mudou de lugar" (T317 removida).
5. **Desfazer de 30 dias**: conferido na chamada; sem job de expiração (T364 removida).
6. **Acesso por área**: continua só apresentação sobre o modelo atual; nova tarefa T365 pede sua confirmação.
7. **Financeiro**: FR-019 fica como contrato até o módulo existir.

## Em aberto

- Aprovação da spec (estava marcada como aprovada; agora é rascunho).
- Confirmar T365, a área de Pluggamob e quem resolve a fila de duplicidades (T301).
- Antecipar a história 4 da 002 (achado A1 da análise).
