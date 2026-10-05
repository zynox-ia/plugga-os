# Especificação: Produto unificado (menu único, seletor como filtro e cadastros únicos)

**Feature Branch**: `claude/funny-albattani-5tnccx` (a numeração `003` vale só para a pasta)

**Created**: 2026-10-05

**Status**: Draft

**Input**: Unificar o Plugga OS em um ecossistema único: menu único por função, seletor de empresa como filtro e cadastros únicos de cliente e fornecedor (decisões do dono em 2026-10-05, ADR-0013).

## Contexto

A Plugga e a Waze operam como um ecossistema só: a Plugga cuida de uma parte, a Waze de outra. O desenho atual as trata como dois mundos: o catálogo é Empresa → Departamento, Financeiro, Comercial e Compras aparecem duas vezes no menu, e o seletor do canto superior direito troca o sistema inteiro. Isso induz "dois CRMs, dois setores de compra, dois cadastros de cliente", o que o cliente da operação pediu para evitar.

Esta spec vem **depois** da spec 002 (`specs/002-fundacao-solida`), cuja história 4 já coloca a empresa como atributo dos registros de negócio e cria o escopo único de acesso. Aqui **não se refaz segurança**: reorganiza-se o produto em cima dela. O modelo está no ADR-0013 (módulos únicos por função; empresa como atributo do registro; cadastros de cliente e fornecedor únicos; seletor como filtro).

A reforma preserva tudo o que já funciona: rotas, telas, dados e links salvos pela equipe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um menu único, por função (Priority: P1)

Como integrante da equipe, quero ver um menu só, organizado pelo que faço (Comercial e Clientes, Compras, Financeiro, Energia, Engenharia e Obras, Eletromobilidade, Equipe e acessos), sem repetir a mesma função por empresa, e ver apenas o que posso usar.

**Why this priority**: é a mudança que a equipe percebe primeiro e que acaba com a sensação de dois sistemas. As rotas já existem; é reorganização, não funcionalidade nova.

**Independent Test**: entrar com perfis diferentes (só Plugga, só Waze, as duas, admin) e conferir que o menu é o mesmo desenho, mostra só as funções permitidas e que cada tela antiga continua alcançável.

**Acceptance Scenarios**:

1. **Given** uma pessoa que alcança só a Waze e atua em Financeiro, **When** abre o sistema, **Then** vê um item "Financeiro" (não "Financeiro Waze") e nenhum item de funções que não pode usar.
2. **Given** uma pessoa que alcança as duas empresas, **When** abre o menu, **Then** vê cada função uma única vez.
3. **Given** um link salvo para uma tela que mudou de lugar, **When** a pessoa o abre, **Then** é levada à nova tela equivalente, sem erro.
4. **Given** todas as telas que hoje funcionam (oportunidades, contratos, clientes, relacionamento comercial, ciclos e auditorias de energia, eficiência energética, Pluggamob, compras, engenharia), **When** o menu novo é publicado, **Then** todas continuam acessíveis a quem as acessava.
5. **Given** processos ainda não construídos ("em breve"), **When** o menu é exibido, **Then** continuam visíveis e claramente marcados como futuros, sem levar a tela vazia.

---

### User Story 2 - O seletor de empresa vira filtro (Priority: P1)

Como pessoa que atua nas duas empresas, quero escolher "Todas", "Plugga" ou "Waze" para filtrar o que vejo, em vez de trocar de sistema; e como pessoa de uma empresa só, não quero nem ver o seletor.

**Why this priority**: o seletor atual é a causa da complexidade que o dono quer eliminar. Sem esta mudança, o menu único não resolve.

**Independent Test**: com usuário das duas empresas, alternar o filtro e conferir listas, totais e indicadores em todos os módulos; com usuário de uma empresa, conferir que o seletor não aparece.

**Acceptance Scenarios**:

1. **Given** uma pessoa que alcança as duas empresas, **When** entra, **Then** o filtro começa em "Todas".
2. **Given** o filtro em "Waze", **When** a pessoa navega por qualquer módulo, **Then** listas, contagens e indicadores mostram só a Waze, e a escolha persiste na sessão.
3. **Given** uma pessoa que alcança só uma empresa, **When** abre o sistema, **Then** o seletor não aparece e tudo se comporta como filtrado por essa empresa.
4. **Given** uma tentativa de usar o filtro (por interface, endereço ou requisição manipulada) com uma empresa que a pessoa não alcança, **When** a tela carrega, **Then** o resultado é vazio ou negado, nunca ampliado.
5. **Given** o filtro ativo, **When** a pessoa abre um registro por link direto de outra empresa que ela alcança, **Then** o registro abre e a tela indica que ele está fora do filtro atual.
6. **Given** a pessoa sai e entra de novo, **When** o sistema abre, **Then** o filtro volta ao padrão ("Todas" para quem alcança as duas).

---

### User Story 3 - Cada registro mostra de que empresa é (Priority: P1)

Como usuário, quero identificar de relance de qual empresa é cada oportunidade, contrato, pedido, obra, ciclo ou lançamento, e ser obrigado a informar a empresa ao criar um registro de negócio.

**Why this priority**: com módulos compartilhados, a empresa deixa de estar implícita no menu; sem uma indicação clara, a equipe confunde de quem é cada coisa, e registros nascem sem empresa.

**Independent Test**: criar um registro de cada tipo de negócio com o filtro em "Todas", em "Plugga" e em "Waze" e conferir a empresa pré-preenchida ou exigida, e a etiqueta nas listas e fichas.

**Acceptance Scenarios**:

1. **Given** listas e fichas de registros de negócio, **When** exibidas, **Then** cada registro mostra a etiqueta da empresa, discreta e acessível (não depende só de cor).
2. **Given** o filtro em uma empresa, **When** a pessoa cria um registro de negócio, **Then** a empresa vem preenchida com essa empresa.
3. **Given** o filtro em "Todas" e a pessoa alcançando as duas empresas, **When** cria um registro, **Then** precisa escolher a empresa explicitamente antes de salvar.
4. **Given** uma pessoa que alcança só uma empresa, **When** cria um registro, **Then** a empresa é preenchida automaticamente, sem pergunta.
5. **Given** a empresa de um registro já criado, **When** a pessoa tenta alterá-la, **Then** só quem tem permissão administrativa nas duas empresas consegue, e a mudança é auditada.

---

### User Story 4 - Um cliente, um cadastro (Priority: P2)

Como pessoa do comercial, quero cadastrar um cliente uma única vez e poder registrar negócios dele com a Plugga e com a Waze, sem duplicar o cadastro.

**Why this priority**: elimina o "dois cadastros de cliente". Fica em P2 porque depende do escopo por empresa da spec 002 e envolve tratar duplicidades já existentes.

**Independent Test**: criar um cliente, registrar uma oportunidade da Plugga e outra da Waze, e conferir quem vê o quê; depois processar duplicidades de teste.

**Acceptance Scenarios**:

1. **Given** um cliente cadastrado, **When** uma pessoa comercial de qualquer empresa o procura, **Then** encontra o mesmo cadastro (nome, documento, contatos).
2. **Given** o mesmo cliente com negócios nas duas empresas, **When** uma pessoa só da Waze abre a ficha, **Then** vê o cadastro e apenas os negócios, propostas, contratos, valores, faturas e estudos da Waze.
3. **Given** a tentativa de cadastrar um cliente com documento ou e-mail já existente, **When** a pessoa salva, **Then** o sistema aponta o cadastro existente e oferece usá-lo.
4. **Given** cadastros duplicados já existentes, **When** a migração roda, **Then** cada par possível aparece numa fila de decisão manual, e nada é unido sem confirmação de uma pessoa responsável.
5. **Given** a união de dois cadastros, **When** confirmada, **Then** todo o histórico (negócios, contratos, estudos, faturas) de ambos permanece ligado ao cadastro resultante, e a união é auditada e reversível por um período definido.
6. **Given** uma pessoa sem papel comercial em nenhuma empresa, **When** procura clientes, **Then** não vê o cadastro.

---

### User Story 5 - Um fornecedor, um cadastro, e lançamento sempre com empresa (Priority: P2)

Como pessoa de Compras ou Financeiro, quero um cadastro único de fornecedor, com cada pedido e lançamento indicando a empresa que compra ou paga.

**Why this priority**: hoje o fornecedor é único por empresa e documento, o que cria o mesmo fornecedor duas vezes. A contabilidade, porém, é separada por CNPJ, então a empresa precisa ficar no pedido e no lançamento.

**Independent Test**: cadastrar um fornecedor e usá-lo em pedidos das duas empresas; conferir numeração e relatórios por empresa.

**Acceptance Scenarios**:

1. **Given** um fornecedor, **When** pedidos da Plugga e da Waze o usam, **Then** há um só cadastro, e cada pedido mostra sua empresa.
2. **Given** a numeração de pedidos, **When** são criados pedidos nas duas empresas, **Then** cada empresa mantém sua própria sequência, sem lacunas nem repetições.
3. **Given** um lançamento financeiro, **When** é criado sem empresa, **Then** é recusado com mensagem clara.
4. **Given** fornecedores já cadastrados em duplicidade (mesmo documento nas duas empresas), **When** a migração roda, **Then** são unidos preservando todos os pedidos, cotações e histórico, com os casos duvidosos em fila de decisão manual.
5. **Given** relatórios e totais de compras, **When** exibidos, **Then** respeitam o filtro de empresa e podem ser vistos por empresa ou consolidados.

---

### User Story 6 - Equipe e acessos em linguagem simples (Priority: P2)

Como gestor, quero conceder acesso dizendo "esta pessoa atua em Financeiro e Comercial, na Waze" (ou "nas duas"), sem precisar entender departamentos por empresa.

**Why this priority**: o modelo de acesso muda na spec 002; sem ajustar a tela, o gestor não consegue usar o modelo novo, e acessos errados viram risco.

**Independent Test**: um gestor concede, altera e revoga acessos pela tela nova e confere o alcance resultante; o alcance de todas as pessoas existentes é igual antes e depois.

**Acceptance Scenarios**:

1. **Given** a tela de Equipe, **When** o gestor concede acesso, **Then** escolhe as áreas e, para cada área, as empresas (Plugga, Waze ou ambas), com um resumo em português do que a pessoa poderá fazer.
2. **Given** um gestor que administra só uma empresa, **When** concede acesso, **Then** só pode oferecer essa empresa e as áreas que ele próprio tem.
3. **Given** pessoas com acesso hoje, **When** a tela nova entra no ar, **Then** o alcance de cada uma é exatamente o mesmo de antes, e a tela mostra isso corretamente.
4. **Given** o ato de conceder, alterar ou revogar, **When** concluído, **Then** fica registrado quem fez, quando e o que mudou.
5. **Given** uma pessoa convidada ainda sem aceitar o convite, **When** o gestor consulta, **Then** vê o acesso planejado e o estado do convite.

---

### User Story 7 - Dashboard e indicadores por empresa e consolidados (Priority: P3)

Como gestor, quero ver totais por empresa e consolidados, restritos ao que posso ver, e saber quando um número é de exemplo.

**Why this priority**: valor de gestão, mas depende de tudo acima e hoje o Dashboard e a Central de Pendências mostram dados de exemplo.

**Independent Test**: comparar os totais do dashboard com a soma das listas por empresa, para pessoas com alcances diferentes.

**Acceptance Scenarios**:

1. **Given** uma pessoa que alcança as duas empresas e o filtro "Todas", **When** abre o dashboard, **Then** vê o total consolidado e a divisão por empresa, e os números batem com as listas.
2. **Given** uma pessoa de uma empresa só, **When** abre o dashboard, **Then** nenhum número inclui a outra empresa.
3. **Given** uma tela cujo conteúdo ainda não tem dados reais, **When** é aberta, **Then** mostra aviso visível de "dados de exemplo" e seu estado no menu não é "pronto".
4. **Given** o filtro de empresa, **When** muda, **Then** todos os indicadores da tela atualizam de forma coerente.

---

### Edge Cases

- Pessoa que alcança as duas empresas mas atua em áreas diferentes em cada uma (Comercial na Plugga, Engenharia na Waze): o menu mostra a união das áreas e cada tela respeita a empresa em que a pessoa tem aquela área.
- Pessoa que perde o acesso a uma empresa com o filtro apontando para ela: o filtro volta ao padrão sem erro.
- Registro cujos vínculos apontam para duas empresas (por exemplo, pedido da Plugga para obra da Waze): é recusado, conforme a spec 002.
- Cliente com o mesmo documento escrito de formas diferentes (com e sem pontuação) é tratado como o mesmo.
- Cliente sem documento: não entra na verificação de duplicidade por documento, só por e-mail ou nome com confirmação manual.
- União de cadastros em que os dois têm dados conflitantes (dois e-mails, dois telefones): ficam todos, com indicação do principal.
- Link salvo para uma rota antiga durante o período de transição: redireciona; depois do período, mostra tela explicando para onde foi.
- Pessoa com o filtro em uma empresa abre um link de registro de outra empresa que alcança: abre, com aviso.
- Impressão e exportação de listas: respeitam o filtro e identificam a empresa.
- Idioma e acessibilidade: todo o texto novo em português; etiquetas de empresa legíveis por leitor de tela e sem depender só de cor.

## Requirements *(mandatory)*

### Functional Requirements

**Menu**

- **FR-001**: O menu MUST ser único, organizado por função (Comercial e Clientes, Compras, Financeiro, Energia, Engenharia e Obras, Eletromobilidade, Equipe e acessos), sem repetir função por empresa.
- **FR-002**: O menu MUST mostrar apenas as funções que a pessoa pode usar, calculadas pelo mesmo escopo de acesso da spec 002, sem lógica de permissão própria.
- **FR-003**: Toda tela que hoje funciona MUST continuar acessível a quem a acessa hoje, e links antigos MUST redirecionar para a tela equivalente.
- **FR-004**: Processos ainda não construídos MUST continuar listados e marcados como "em breve", sem levar a telas vazias.

**Filtro de empresa**

- **FR-005**: O seletor de empresa MUST ser um filtro com as opções "Todas", "Plugga" e "Waze", limitado às empresas que a pessoa alcança.
- **FR-006**: Quem alcança uma única empresa MUST NOT ver o seletor.
- **FR-007**: O filtro MUST se aplicar a listas, contagens, indicadores, exportações e impressões de todos os módulos de negócio, e MUST persistir durante a sessão.
- **FR-008**: O filtro MUST apenas restringir; escolher uma empresa que a pessoa não alcança MUST resultar em vazio ou negado.
- **FR-009**: O padrão do filtro MUST ser "Todas" para quem alcança as duas empresas, a cada nova sessão.

**Empresa nos registros**

- **FR-010**: Listas, fichas e indicadores MUST identificar a empresa de cada registro por rótulo textual, com indicação visual complementar acessível.
- **FR-011**: A criação de registro de negócio MUST exigir empresa: preenchida pelo filtro quando houver uma só; escolhida explicitamente quando o filtro for "Todas"; automática para quem alcança uma só.
- **FR-012**: Alterar a empresa de um registro existente MUST exigir permissão administrativa nas duas empresas e MUST ser auditado.

**Cadastro único de cliente**

- **FR-013**: Cliente MUST ser um cadastro único, sem empresa dona, visível a quem tem papel comercial em qualquer empresa; negócios, propostas, contratos, valores, faturas e estudos MUST continuar filtrados pela empresa do registro.
- **FR-014**: O sistema MUST impedir cadastro duplicado por documento (normalizado) e por e-mail, apontando o cadastro existente.
- **FR-015**: Duplicidades existentes MUST ser listadas em fila de decisão manual; nenhuma união MUST ocorrer sem confirmação de pessoa responsável.
- **FR-016**: A união de cadastros MUST preservar todo o histórico, MUST ser auditada e MUST poder ser desfeita por um período definido.

**Cadastro único de fornecedor e financeiro**

- **FR-017**: Fornecedor MUST ser um cadastro único por documento; o vínculo com a empresa MUST viver nos pedidos, cotações e lançamentos.
- **FR-018**: A numeração de pedidos MUST continuar por empresa, sem lacunas nem repetições.
- **FR-019**: Todo lançamento financeiro MUST exigir empresa.
- **FR-020**: Fornecedores duplicados existentes MUST ser unidos preservando pedidos, cotações e histórico, com os casos duvidosos em fila de decisão manual.

**Equipe e acessos**

- **FR-021**: A tela de Equipe MUST permitir conceder acesso por área e, para cada área, as empresas, com resumo em português do que a pessoa poderá fazer.
- **FR-022**: O gestor MUST só poder oferecer áreas e empresas que ele próprio administra.
- **FR-023**: A passagem para a tela nova MUST NOT alterar o alcance de nenhuma pessoa, comprovado por comparação antes e depois.
- **FR-024**: Conceder, alterar e revogar acesso MUST ser auditado com autor, data e mudança.

**Indicadores e honestidade**

- **FR-025**: Dashboard e indicadores MUST respeitar o filtro e o escopo da pessoa e MUST mostrar total consolidado e divisão por empresa, batendo com as listas.
- **FR-026**: Telas sem dados reais MUST exibir aviso visível de dados de exemplo e MUST NOT constar como "pronto" no menu.

**Transição**

- **FR-027**: Todas as migrações de dados MUST ser aditivas e reversíveis, com backup restaurado antes (constituição, princípio VI), e MUST NOT exigir indisponibilidade planejada.
- **FR-028**: A mudança de menu MUST poder ser ativada e desativada sem nova publicação, para que a equipe volte ao desenho anterior se algo falhar durante a transição.
- **FR-029**: Nenhuma mudança desta feature MUST escrever, enviar ou fazer cutover em sistemas externos.

### Key Entities

- **Empresa**: Plugga ou Waze; valor fixo do catálogo; atributo dos registros de negócio e dos lançamentos.
- **Área funcional**: função que a pessoa exerce (Comercial e Clientes, Compras, Financeiro, Energia, Engenharia e Obras, Eletromobilidade, Equipe e acessos); aparece uma vez no menu.
- **Escopo de acesso**: áreas que a pessoa exerce e, para cada uma, as empresas em que vale (definido na spec 002).
- **Filtro de empresa**: escolha de visualização da sessão, sempre dentro do escopo; nunca amplia acesso.
- **Cliente**: cadastro único (nome, documento, contatos) sem empresa dona; relaciona-se com negócios de cada empresa.
- **Fornecedor**: cadastro único por documento; relaciona-se com pedidos e lançamentos de cada empresa.
- **Registro de negócio**: oportunidade, contrato, ciclo, auditoria, estudo, fechamento, pedido, obra ou lançamento; sempre com empresa.
- **Fila de decisão manual**: lista de duplicidades e casos duvidosos que uma pessoa responsável resolve; cada decisão é auditada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cada função aparece exatamente uma vez no menu para 100% dos perfis testados (só Plugga, só Waze, as duas, admin).
- **SC-002**: 100% das telas e links que funcionam hoje continuam acessíveis ou redirecionam corretamente após a mudança.
- **SC-003**: Uma pessoa nova identifica, sem ajuda, de qual empresa é um registro em menos de 5 segundos em 9 de cada 10 tentativas de teste de usabilidade.
- **SC-004**: Pessoas de uma empresa só nunca veem o seletor, e 100% das tentativas de forçar uma empresa não permitida resultam em vazio ou negado.
- **SC-005**: 100% dos registros de negócio criados após a mudança têm empresa; 0 criados sem.
- **SC-006**: 0 clientes e 0 fornecedores duplicados por documento após a migração, e 100% dos casos duvidosos passam pela fila de decisão manual, com histórico íntegro (contagem de negócios, pedidos e estudos antes igual à depois).
- **SC-007**: O alcance de cada pessoa antes e depois da mudança de acesso é idêntico em 100% dos casos comparados.
- **SC-008**: Um gestor concede um acesso completo (áreas e empresas) em menos de 2 minutos na tela nova, em teste com usuários reais.
- **SC-009**: Os totais do dashboard batem com a soma das listas em 100% das combinações de filtro testadas.
- **SC-010**: Nenhuma tela sem dados reais aparece como "pronto" ou sem aviso de exemplo.
- **SC-011**: A transição ocorre sem indisponibilidade planejada, e a volta ao menu anterior leva menos de 5 minutos, sem nova publicação.
- **SC-012**: A equipe relata queda de pelo menos 50% nas dúvidas do tipo "em qual empresa/menu eu faço isso?" em duas semanas após a entrada no ar.

## Assumptions

- A spec 002 (história 4, FR-017 a FR-019b) é entregue **antes**: campo de empresa nos registros, escopo único e papéis por empresa. Esta feature depende dela e não refaz segurança.
- O ADR-0013 é a referência do modelo e depende da revisão do ARCHITECT (status Proposto).
- Premissa padrão do ADR-0013: quem tem papel comercial em qualquer empresa vê o **cadastro** de cliente (nome, documento, contatos), nunca os dados de negócio da outra empresa. A Waze vê os contatos de clientes da Plugga.
- O filtro "Todas" é o padrão apenas para quem alcança as duas empresas; quem alcança uma empresa vê só ela, sem seletor.
- Nomes das áreas no menu: Comercial e Clientes, Compras, Financeiro, Energia, Engenharia e Obras, Eletromobilidade, Equipe e acessos. Ajustes de rótulo não alteram a spec.
- Os papéis e áreas existentes continuam; só muda a forma de agrupá-los e concedê-los.
- Período de transição para links antigos: 90 dias; depois, tela explicativa.
- Período em que a união de cadastros pode ser desfeita: 30 dias.
- Quem resolve a fila de decisão manual é o dono do sistema ou quem ele designar.
- Relatórios e módulos ainda "em breve" (Contas a pagar, Contas a receber, D+14, OMIE) estão fora de escopo; só herdam a regra de empresa obrigatória quando forem construídos.
- Mobile e redesenho visual da marca estão fora de escopo; só se altera o necessário para menu, seletor e etiquetas.
