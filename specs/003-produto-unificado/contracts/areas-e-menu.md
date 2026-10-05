# Contrato: áreas e menu

`packages/shared/src/areas.ts` exporta `areas`: `{ id, rotulo, departamentos: DepartmentId[], itens: { rotulo, rota, estado: 'pronto'|'parcial'|'em-breve' }[] }`.

Regras:

1. Menu = áreas em que a pessoa tem ao menos um dos `departamentos` (via `visibleDepartments`) ou é admin de plataforma. Cada área aparece uma vez.
2. Itens `em-breve` ficam visíveis, desabilitados e marcados; nenhuma rota leva a tela vazia.
3. Item `pronto` exige dados reais; telas de exemplo ficam `parcial` ou `em-breve` (FR-026).
4. Verificação no carregamento: todo `DepartmentId` de `departmentIdsByCompany` pertence a exatamente uma área, senão o módulo falha (mesmo padrão de `organizacao.ts:366-379`).
5. Chave `menu_unificado` desligada, ou leitura da chave falhando: valem o menu antigo (`navGroupsForEmpresa`) e o seletor antigo, inclusive com `?empresa=`.

Mapa inicial (a confirmar com o dono, ver `analise.md`): Comercial e Clientes, Compras, Financeiro, Energia, Engenharia e Obras, Eletromobilidade, Equipe e acessos.
