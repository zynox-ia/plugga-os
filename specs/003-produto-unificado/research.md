# Pesquisa e decisões: Produto unificado

Fonte: leitura do código em 2026-10-05. Nenhum ponto da spec ficou como "NEEDS CLARIFICATION"; as escolhas abaixo resolvem o como, não o quê.

## D1/D2. Filtro de empresa por tela

- **Decisão**: parâmetro `?empresa=todas|plugga|waze` por tela; o servidor do Next lê, valida contra as empresas da pessoa e envia `companyId` à API. A API calcula `empresasPermitidas ∩ filtro`. Valor inválido: volta ao padrão no web; se chegar à API fora do escopo, devolve vazio.
- **Por quê**: `?empresa=` já existe, então links antigos continuam funcionando. Só Compras já envia `companyId`; os demais módulos passam a aceitá-lo por um auxiliar compartilhado em cima do `CompanyScope` (002 T140).
- **Alternativas**: cookie ou contexto global (é o seletor global de volta); filtro só no cliente (vaza dados).
- **Risco**: contagens e exportações precisam usar a mesma consulta da lista. Mitigação: teste por tela comparando lista, contagem e exportação.

## D3. Menu por área

- **Ordem**: construir antes, ativar só depois da 002 T145 e T150.
- **Decisão**: mapa fixo em `packages/shared/src/areas.ts`. Proposta: Comercial e Clientes ← `comercial-clientes` (Plugga) e `comercial-obras` (Waze); Compras ← compras dos dois; Financeiro ← `financeiro`; Energia ← `energia-opm`; Engenharia e Obras ← `engenharia-obras`; Eletromobilidade ← `produto-tecnologia`/Pluggamob (a confirmar com o dono); Equipe e acessos ← gestão de acesso. A visibilidade usa `visibleDepartments` do shared, a mesma fonte do guard.
- **Risco**: o catálogo web falha no carregamento se divergir do shared (`organizacao.ts:366-379`); o mapa novo ganha a mesma verificação.

## D4. Chave liga/desliga do menu

- **Fato**: não há flag de tempo de execução; as de ambiente exigem reiniciar o contêiner.
- **Decisão**: `feature_flags` + `GET /config/flags`; o shell lê com cache curto. Escrita só por admin, com evento de auditoria. Se a leitura falhar, vale o **menu antigo** (falha segura). A chave vale só para o menu; o seletor sai de vez quando os filtros estiverem em uso.

## D5. Links antigos

Quase todas as rotas de tela permanecem. Mudam de lugar apenas itens que eram por empresa (por exemplo "Obras" da Waze apontava para `/engenharia?empresa=waze`) e rotas que a reorganização renomear. O mapa fica em shared; `next.config.ts` aplica `redirects()`; passados 90 dias a regra de redirecionamento é removida.

## D6/D7. Cadastros únicos

- **Fato**: `clients` não tem documento; `fornecedores` é único por `(company_id, documento)` com documento opcional.
- **Decisão**: normalização única em shared (`normalizarDocumento`, `normalizarEmail`). O backfill preenche as colunas novas; duplicatas viram itens de `cadastro_decisao` (nunca união automática). Documento ausente não entra na checagem por documento. A união move os vínculos (obras, pedidos, oportunidades, contratos, estudos, contatos) para o cadastro mantido e grava `cadastro_uniao` com os ids movidos, o que permite desfazer por 30 dias.
- **Fornecedor**: depois da fila, índice único em `documento_normalizado`; pedidos continuam com `company_id`; a numeração por empresa não muda.

## D8. Fila de decisão

Estados: `pendente`, `unir`, `manter_separados`, `desfeita`. Quem decide: admin ou pessoa designada pelo dono. Cada decisão é auditada. "Manter separados" registra o par para não reaparecer.

## D10. Dashboard

Hoje é todo mock e `fetchHealth` é ignorado. Nesta spec: filtro de empresa próprio e selo "dados de exemplo" nos blocos sem dado real; o item de menu não fica "pronto" (FR-026). Indicadores reais novos ficam para outra feature (fora do pedido do dono).

## Perguntas para o dono

1. Em qual área entra Pluggamob/`produto-tecnologia`? (proposta: Eletromobilidade)
2. Quem, além do dono, resolve a fila de decisão?
3. A chave do menu pode ser a tabela `feature_flags` (proposta) ou prefere variável de ambiente, que exige reiniciar o contêiner?
