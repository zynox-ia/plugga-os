# Verificação: Produto unificado

Pré-requisito: banco local com seed sintético e usuários de teste: só Plugga, só Waze, as duas e admin.

0. **Ordem**: o menu novo só é ligado em produção depois de 002 T145 e T150.
1. **Menu (US1)**: e2e "menu único". Para cada perfil, cada área aparece uma vez; rotas antigas redirecionam; "em breve" fica desabilitado.
2. **Filtro por tela (US2)**: e2e "filtro de empresa" e `pnpm test:catalogo-telas`. Sem seletor global; lista, contagem e exportação obedecem ao filtro; `?empresa=` fora do escopo resulta em vazio.
3. **Empresa nos registros (US3)**: criar um registro de cada tipo com o filtro em Todas, Plugga e Waze; a etiqueta aparece com texto; a troca de empresa só por admin das duas, com auditoria.
4. **Clientes (US4) e fornecedores (US5)**: suíte `test:db` do módulo `cadastros-unicos`; script `ops/confere-contagens-cadastros.sh` em cópia de teste; a fila resolve, a união mantém as contagens e o desfazer restaura.
5. **Equipe (US6)**: teste de equivalência de alcance da 002 (T152) e e2e de concessão por área.
6. **Dashboard (US7)**: filtro de empresa próprio, selo de exemplo nos blocos sem dado real, e todo número real batendo com as listas.
7. **Chave do menu (FR-028)**: alternar `menu_unificado` pelo admin e conferir a volta ao desenho antigo em menos de 5 min, sem publicação.
8. **Contrato de entrega**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
