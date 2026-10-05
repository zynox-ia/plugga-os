# ADR-0013 — Empresa como atributo do registro, módulos compartilhados e escopo único

- Status: Proposto · Data: 2026-10-05 · Decisores: dono do sistema (decisões de produto confirmadas em 2026-10-05), ARCHITECT (revisão pendente) · Contexto: spec `specs/002-fundacao-solida` (história 4) e spec 003 (unificação do produto)

## Contexto

O Plugga OS atende duas empresas, Plugga e Waze, que operam como um único ecossistema.
O desenho atual trata cada uma como um "mundo" separado: o catálogo é Empresa → Departamento
(`packages/shared/src/organization.ts`), o menu repete departamentos (Financeiro e Comercial
existem nas duas; Compras aparece nas duas) e o seletor do canto superior direito troca o
mundo inteiro. O acesso é um par (empresa, departamento) (handoff `equipe-acesso-empresa-departamento`).

Problemas confirmados na auditoria de 2026-10-05:

1. **Isolamento incompleto.** Só Compras e Obras guardam `company_id` e filtram por empresa.
   Clientes, Comercial, Energia, Eficiência energética e Pluggamob não guardam. Um papel
   concedido em qualquer empresa vale em todas (`flattenRoles` + `RolesGuard`).
2. **Duplicação conceitual.** "Dois CRMs, dois setores de compra, dois cadastros de cliente"
   é o que o desenho de mundos separados induz. O cliente da operação pediu o contrário: um
   ecossistema só, com cada empresa cuidando de uma parte.
3. **Regra de escopo duplicada.** `ComprasEscopoRepository` e `ObrasEscopoRepository` repetem a
   mesma lógica, e o próprio código registra que ela deveria ir para `core/auth`.

## Decisão

1. **Módulos por função, um de cada.** Comercial/CRM, Clientes, Compras, Financeiro, Energia,
   Engenharia/Obras, Eletromobilidade e Equipe existem uma vez. Não há "Financeiro da Plugga" e
   "Financeiro da Waze" como módulos distintos.
2. **Empresa é atributo do registro de negócio**, valor em {`plugga`, `waze`}, com o significado
   "empresa responsável" (quem contrata, vende, paga ou fatura). Tabelas de negócio têm
   `company_id` obrigatório: oportunidade, contrato, ciclo e auditoria de energia, estudo de
   eficiência, fechamento Pluggamob, pedido de compra, obra, lançamento financeiro.
3. **Cadastros de pessoa e organização são únicos e sem empresa dona.** Cliente e fornecedor são
   cadastrados uma vez. A relação com cada empresa vive nos registros de negócio. Isso permite a
   um mesmo cliente comprar da Plugga e da Waze sem duplicidade.
   - Visibilidade do cadastro de cliente (nome, documento, contatos): quem tem papel comercial
     em **qualquer** empresa vê o cadastro.
   - Dados de negócio do cliente (oportunidades, propostas, contratos, valores, faturas,
     estudos) são filtrados pela empresa do registro.
   - Fornecedor: cadastro único; o vínculo com a empresa vive nos pedidos e lançamentos.
     (Hoje `fornecedores` tem `company_id` e unicidade `(company_id, documento)`; a migração para
     cadastro único é parte da spec 003.)
4. **Lançamento financeiro exige empresa**, porque os CNPJs são distintos e a contabilidade é
   separada. Numeração de pedidos continua por empresa.
5. **Acesso por área e empresa.** Cada pessoa recebe papéis por área funcional e as empresas em
   que cada papel vale (uma ou ambas). O admin de plataforma alcança as duas, como hoje, por
   regra de leitura e não por linhas materializadas. O conceito (empresa, departamento) é
   substituído por (área, empresas).
6. **Escopo único.** Um componente em `core/auth` calcula o conjunto de empresas permitidas para
   o usuário e todo repositório de módulo de negócio o aplica em toda consulta e mutação. Registro
   de empresa não permitida responde "não encontrado". Os dois repositórios de escopo atuais
   (Compras e Obras) são absorvidos por esse componente.
7. **Concessão.** Quem concede papéis só concede áreas e empresas que administra; um papel
   concedido numa empresa nunca vale em outra.
8. **O seletor do topo vira filtro** "Todas · Plugga · Waze" (padrão: tudo que a pessoa pode ver).
   Quem tem uma empresa só não vê o seletor. O filtro nunca amplia acesso: ele só restringe o que
   o escopo já permite.
9. **Dados existentes.** Registros de módulos sem empresa recebem `plugga`, que é como a migração
   de 2026-08-11 já atribuiu esses acessos. Compras e Obras já têm empresa e permanecem. Casos
   duvidosos vão para fila de decisão manual, nunca são adivinhados.

## Faseamento

- **Spec 002, história 4 (segurança):** campo de empresa nos registros que não o têm, escopo
  único em `core/auth`, concessão limitada, testes de negação entre empresas. **Não** altera menu
  nem cadastros.
- **Spec 003 (produto):** menu único por função, seletor como filtro, cadastros únicos de cliente
  e fornecedor, rótulos de empresa nos registros, ajustes das telas de Equipe e acessos.

## Consequências

**Positivas**

- Uma única regra de isolamento, testável em um lugar, em vez de uma por módulo.
- Fim da duplicação de módulos e de cadastros; um cliente tem uma ficha só.
- Evolução de novos módulos (Financeiro real, OMIE) já nasce com empresa como atributo.
- Menu e seletor mais simples para a equipe.

**Negativas**

- Mudança de modelo de acesso: o par (empresa, departamento) deixa de existir e as tabelas
  `user_department_access` e `user_company_roles` precisam migrar. Exige migração reversível e
  teste de equivalência (ninguém ganha nem perde alcance sem decisão do dono).
- Cadastro de cliente visível entre empresas é uma escolha de privacidade que precisa constar na
  política de dados (spec 002, história 8).
- Duas specs e uma ordem de entrega a respeitar.

**Neutras**

- A empresa continua sendo valor fixo do catálogo; o sistema segue single-tenant (ADR-0008).

## Alternativas consideradas

1. **Manter dois mundos e só corrigir o isolamento.** Resolve a falha de segurança, mas mantém
   duplicação de módulos e cadastros, que é o que o cliente rejeitou. Rejeitada.
2. **Um sistema sem empresa como dimensão.** Simples, mas perde a separação fiscal e contábil
   (CNPJs distintos) e o controle de quem vê o quê. Rejeitada.
3. **Cadastro de cliente por empresa com vínculo opcional.** Preserva privacidade máxima, mas
   reintroduz a duplicidade. Rejeitada; a privacidade é obtida filtrando os dados de negócio.

## Gatilhos de revisão

- Entrada de uma terceira empresa ou de um parceiro com acesso restrito.
- Exigência jurídica ou contratual de segregar o cadastro de clientes entre empresas.
- Integração OMIE exigir separação de plano de contas que o atributo não represente.

## Guardas de escopo (o que este ADR NÃO autoriza)

- Dar a qualquer usuário alcance maior que o atual sem concessão explícita.
- Migrar dados sem backup restaurado e plano de reversão (constituição, princípio VI).
- Qualquer escrita, envio ou cutover em sistemas externos (ADR-0005).
