# Especificação: Fundação sólida do Plugga OS (segurança, arquitetura e operação)

**Feature Branch**: `claude/funny-albattani-5tnccx` (a numeração `002` vale só para a pasta; o projeto não usa branch por feature)

**Created**: 2026-10-05

**Status**: Draft

**Input**: Corrigir as falhas de segurança, arquitetura e operação encontradas na auditoria de 2026-10-05, para que o sistema, já em produção com dado real de clientes, seja seguro de evoluir.

## Contexto

O Plugga OS está em produção em <https://os.plugga.app.br> e guarda dado real de clientes (faturas de energia, CNPJ, unidade consumidora, contatos), compras e obras das duas empresas (Plugga e Waze). A auditoria de 2026-10-05 revisou cinco frentes (API, segurança, dados, frontend, CI e operação) e confirmou em código os achados abaixo. O sistema também tem bases boas, que esta feature **não pode piorar** (ver "Bases a preservar").

Esta spec trata de **corrigir e endurecer o que já existe**. Ela não cria domínio de negócio novo e não autoriza escrita, envio ou cutover em Bitrix, OMIE, PluggaMob, PagBank, WhatsApp, Telegram ou OpenClaw (constituição, princípio I).

Cada história abaixo é entregável e verificável sozinha. A ordem de ataque está na seção "Ordem de ataque".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Só código revisado chega à produção (Priority: P1)

Como dono do sistema, quero que nenhuma mudança vá para a produção sem ter passado por revisão e CI verde na branch principal do repositório oficial, e que o servidor de produção não possa ser controlado por quem apenas consegue abrir um PR ou uma branch.

**Why this priority**: hoje o publicador automático confere só o nome da branch do CI que o disparou. Um PR de fork com branch chamada `main` pode publicar código não revisado com poder total sobre o servidor, o banco, os arquivos e os segredos. É o maior risco isolado do sistema.

**Independent Test**: simular (em repositório de teste ou com o fluxo em modo de verificação, sem tocar a produção) um CI vindo de PR, de fork e de push na `main` oficial, e conferir que só o último dispara publicação.

**Acceptance Scenarios**:

1. **Given** um PR aberto de um fork cuja branch se chama `main`, **When** o CI desse PR termina verde, **Then** nenhuma publicação em produção é iniciada.
2. **Given** um push na `main` do repositório oficial com CI verde, **When** a publicação é solicitada, **Then** ela só prossegue após a aprovação explícita de um responsável nomeado.
3. **Given** duas publicações solicitadas quase ao mesmo tempo, **When** ambas chegam ao servidor, **Then** uma espera a outra e a versão mais antiga nunca sobrescreve a mais nova.
4. **Given** uma publicação travada, **When** o tempo máximo definido passa, **Then** ela é encerrada e o estado anterior continua servindo.
5. **Given** um PR altera os arquivos de workflow ou os scripts de publicação, **When** ele é aberto, **Then** exige revisão de um responsável designado antes do merge.
6. **Given** o script manual de publicação e o automático, **When** um deles está em andamento, **Then** o outro recusa começar.

---

### User Story 2 - Dados de clientes fora do repositório (Priority: P1)

Como dono do sistema, quero que nenhum dado real de cliente (CNPJ, unidade consumidora, nome, valores de fatura) esteja versionado, e que a CI barre qualquer reintrodução.

**Why this priority**: o git é permanente e replicado em cada clone; um dado exposto ali não pode ser revogado. A própria regra do repositório já proíbe isso, mas há dezenas de arquivos de casos, planilhas e um template com dado de cliente versionados, e o scanner atual só detecta segredo, não dado pessoal ou de cliente.

**Independent Test**: rodar o scanner novo sobre a árvore de arquivos e sobre um commit que reintroduz um CNPJ real, e conferir que o primeiro passa e o segundo falha.

**Acceptance Scenarios**:

1. **Given** a árvore atual do repositório, **When** o scanner de dados de cliente roda, **Then** não encontra CNPJ, CPF, unidade consumidora ou nome de cliente real fora de fixtures sintéticas declaradas.
2. **Given** os testes que hoje usam os casos reais, **When** passam a usar fixtures sintéticas equivalentes, **Then** continuam verdes e continuam cobrindo os mesmos comportamentos (mesmas faixas de valores e mesmos formatos de fatura).
3. **Given** um PR que adiciona um documento com CNPJ ou CPF válido não sintético, **When** a CI roda, **Then** ela falha e aponta o arquivo.
4. **Given** os arquivos reais removidos da árvore, **When** o time precisa deles para regressão, **Then** eles estão no armazenamento privado do corpus, acessíveis por chave de leitura, e não no git.
5. **Given** a decisão do dono sobre o histórico, **When** ela é executada, **Then** o procedimento e o efeito sobre clones existentes estão documentados e verificados.

---

### User Story 3 - Backup que sobrevive à perda do servidor (Priority: P1)

Como dono do sistema, quero que o banco **e** os arquivos enviados (faturas, cotações, evidências de obra) tenham cópia fora do servidor de produção, com restauração testada periodicamente e alerta quando o backup falhar.

**Why this priority**: hoje o dump do banco fica no mesmo servidor, os arquivos de negócio não têm cópia nenhuma, ninguém é avisado se o backup falha e o script que realmente roda em produção não é o versionado. A perda do disco ou do servidor perderia tudo.

**Independent Test**: executar o backup, restaurar em ambiente descartável, e conferir contagem de registros e de arquivos e checksum de uma amostra; depois derrubar o backup de propósito e conferir que o alerta chega.

**Acceptance Scenarios**:

1. **Given** o backup diário, **When** termina, **Then** existe uma cópia do banco e de todos os baldes de negócio em um destino fora do servidor, criptografada.
2. **Given** a cópia mais recente, **When** a verificação periódica roda, **Then** ela restaura em ambiente descartável e confere que contagens e checksums batem, e registra o resultado.
3. **Given** que o backup não rodou ou falhou, **When** passa o prazo esperado, **Then** o responsável recebe um aviso sem precisar olhar o log.
4. **Given** o script de backup, o agendamento e a configuração do proxy reverso, **When** o repositório é consultado, **Then** todos estão versionados e a publicação os instala, de modo que o que roda é o que está no repositório.
5. **Given** um desastre, **When** alguém precisa recuperar, **Then** existe um passo a passo escrito, testado, com o tempo medido.

---

### User Story 4 - Cada empresa só enxerga e altera os próprios dados (Priority: P1)

Como gestor de uma empresa, quero ter certeza de que uma pessoa com papel na Waze não lê nem altera clientes, oportunidades, ciclos de energia, estudos, faturas ou fechamentos da Plugga, e vice-versa.

**Why this priority**: hoje um papel concedido em qualquer empresa vale em todas. Só Compras e Obras checam empresa. Nos demais módulos, uma pessoa com papel comercial na Waze acessa, por URL direta ou pela API, registros da Plugga, e um gerente de departamento pode conceder esses papéis.

**Independent Test**: criar dois usuários, um em cada empresa, com o mesmo papel, e tentar ler, listar, alterar e aprovar registros da outra empresa por todas as rotas do módulo; todas as tentativas devem ser negadas, sem revelar que o registro existe.

**Acceptance Scenarios**:

1. **Given** um usuário da empresa A com papel comercial, **When** pede um cliente da empresa B pelo identificador, **Then** recebe "não encontrado".
2. **Given** o mesmo usuário, **When** lista clientes, oportunidades, contratos, ciclos, estudos ou fechamentos, **Then** só vê os da empresa A.
3. **Given** um gerente de departamento da empresa A, **When** tenta conceder um papel que vale em outra empresa, **Then** a concessão é negada.
4. **Given** os dados existentes sem empresa dona, **When** a correção é aplicada, **Then** todos recebem uma empresa conforme a regra decidida pelo dono, nenhum registro é perdido e a mudança é reversível.
5. **Given** um usuário com acesso às duas empresas (administração), **When** consulta, **Then** vê as duas, com a empresa de cada registro identificada.

---

### User Story 5 - Toda rota é fechada por padrão (Priority: P1)

Como dono do sistema, quero que uma rota nova esqueça de declarar permissão e **fique inacessível**, em vez de aberta a qualquer usuário logado ou ao público.

**Why this priority**: hoje cada rota precisa lembrar de aplicar a proteção; a ausência de declaração libera o acesso. Já houve bugs por isso (jobs e integrações liberados a qualquer autenticado) e ainda há rotas sem papel, como o status de e-mail.

**Independent Test**: um teste automático percorre todas as rotas registradas e falha se alguma não declarar explicitamente "pública" ou os papéis exigidos.

**Acceptance Scenarios**:

1. **Given** uma rota nova sem declaração de acesso, **When** alguém a chama logado, **Then** recebe acesso negado.
2. **Given** a lista de rotas públicas (saúde, login, convite, redefinição, retorno do Google), **When** o teste de inventário roda, **Then** só essas estão marcadas como públicas.
3. **Given** a rota de status de e-mail e as rotas de equipe, **When** chamadas sem papel adequado ou com identificador malformado, **Then** recebem acesso negado ou "requisição inválida", nunca erro interno.
4. **Given** o mecanismo de autenticação de produção, **When** o código é lido, **Then** seu nome e sua função são distintos do atalho de desenvolvimento, e o atalho só pode existir em ambiente local ou de teste.

---

### User Story 6 - Integrações externas obedecem ao modo declarado (Priority: P1)

Como dono do sistema, quero que qualquer chamada para fora (modelo de linguagem, e-mail, armazenamento, Bitrix) só aconteça se o modo daquela integração permitir, para que a regra "mock por padrão" do ADR-0005 seja verdadeira por construção, não por convenção.

**Why this priority**: o modo só é imposto no Bitrix. O envio de fatura inteira de cliente para o provedor de modelo de linguagem depende apenas de existir uma chave configurada.

**Independent Test**: com cada integração em `mock`, tentar acioná-la e conferir que nenhuma chamada de rede sai e que o resultado é o simulado e auditado.

**Acceptance Scenarios**:

1. **Given** a integração de modelo de linguagem em `mock`, **When** uma fatura é lida, **Then** nada é enviado ao provedor externo e o usuário vê que o resultado é simulado.
2. **Given** uma integração nova, **When** alguém tenta chamar a rede sem passar pela verificação de modo, **Then** um teste automático ou a análise estática falha.
3. **Given** a decisão de que e-mail e armazenamento ficam fora do modelo de modo, **When** isso for escolhido, **Then** existe um ADR que o registra e o código reflete.
4. **Given** uma troca de modo, **When** acontece, **Then** fica auditada com quem trocou e quando.

---

### User Story 7 - Operações críticas são atômicas, concorrência-seguras e auditadas (Priority: P2)

Como responsável pela operação, quero que aprovar um estudo, assinar uma APR, revogar uma liberação, ganhar uma oportunidade, numerar um pedido ou aprovar um fechamento nunca deixe estado pela metade, nunca sobrescreva uma decisão concorrente, e sempre deixe registro de quem fez.

**Why this priority**: hoje essas operações fazem várias escritas sem transação, algumas sobrescrevem sem condição e algumas não deixam trilha. Dois cliques simultâneos podem zerar os administradores, aprovar duas vezes ou deixar cliente órfão. O envio de um relatório ao cliente não tem registro de quem aprovou.

**Independent Test**: para cada operação, disparar duas execuções simultâneas e uma falha no meio, e conferir que exatamente uma vence, nada fica parcial e há exatamente um registro de auditoria por efeito.

**Acceptance Scenarios**:

1. **Given** exatamente dois administradores, **When** ambos tentam se rebaixar ao mesmo tempo, **Then** pelo menos um permanece administrador.
2. **Given** um estudo pronto, **When** duas aprovações chegam juntas, **Then** uma vale, a outra recebe conflito, e fica registro de quem aprovou e quando.
3. **Given** uma falha no meio de uma aprovação, **When** o sistema volta, **Then** o estudo e o tipo de fatura continuam consistentes entre si.
4. **Given** uma APR já assinada ou uma liberação já revogada, **When** alguém tenta assinar ou revogar de novo, **Then** a decisão original é preservada e a tentativa é recusada com mensagem clara.
5. **Given** uma oportunidade ganha, **When** a operação falha depois de criar o cliente, **Then** nenhum cliente órfão permanece.
6. **Given** dois pedidos criados juntos na mesma empresa, **When** disputam o mesmo número, **Then** ambos são criados com números distintos, sem erro para o usuário.
7. **Given** qualquer conflito de concorrência, **When** a API responde, **Then** a resposta é de conflito (409) com mensagem em português, nunca erro interno.
8. **Given** o autor da aprovação de um estudo, **When** consultado, **Then** ele corresponde a um usuário existente.

---

### User Story 8 - Dados pessoais protegidos e com ciclo de vida definido (Priority: P2)

Como encarregado de dados, quero que nome, telefone, e-mail e documento de pessoas não fiquem em texto puro em registros imutáveis, e que exista política de retenção e caminho para atender pedido de apagamento.

**Why this priority**: o log de eventos é imutável por desenho, mas recebe o conteúdo completo de cadastros (nome, telefone, e-mail, CNPJ/CPF). Isso torna impossível atender um pedido de apagamento da LGPD. Sessões guardam IP e agente de navegação sem limpeza programada.

**Independent Test**: criar e editar um cliente e um fornecedor, e conferir que o log de eventos guarda só identificadores e nomes de campos alterados; depois aplicar um pedido de apagamento de teste e conferir que a pessoa deixa de ser identificável em todo o sistema.

**Acceptance Scenarios**:

1. **Given** a criação ou edição de cliente, fornecedor ou contato, **When** o evento é registrado, **Then** ele contém identificadores e nomes de campos, e não os valores pessoais.
2. **Given** eventos antigos que já contêm valores pessoais, **When** a política é decidida, **Then** o tratamento (mascarar, expirar ou manter com justificativa) é executado e documentado sem violar a imutabilidade acordada.
3. **Given** sessões expiradas, **When** o prazo de retenção passa, **Then** elas e seus IP e agente de navegação são removidos automaticamente.
4. **Given** um pedido de apagamento de um titular, **When** é atendido, **Then** o procedimento escrito identifica todos os lugares com seus dados e o resultado é verificável.
5. **Given** a política, **When** consultada, **Then** lista cada categoria de dado pessoal, a finalidade, o prazo e o responsável.

---

### User Story 9 - Banco impõe as regras que o código assume (Priority: P2)

Como responsável técnico, quero que unicidade, vínculos entre registros e estados válidos sejam garantidos pelo banco, não só pelo código, para que nenhum caminho de escrita (inclusive futuro ou manual) corrompa os dados.

**Why this priority**: hoje duplicidade de cliente e de unidade consumidora é evitada só em código; obra, fornecedor e cotação de empresas ou pedidos diferentes poderiam se misturar; o status de usuário (que controla revogação de acesso) é texto livre; há vínculos que conflitam com a regra de imutabilidade e gatilhos que não protegem contra esvaziamento de tabela.

**Independent Test**: tentar, direto no banco de teste, inserir duplicata, vínculo entre empresas diferentes, status inválido e esvaziar uma tabela imutável; todas devem ser recusadas.

**Acceptance Scenarios**:

1. **Given** dados já existentes, **When** as novas restrições de unicidade são aplicadas, **Then** duplicatas atuais foram antes listadas, resolvidas com o dono, e a aplicação não perde registro.
2. **Given** um pedido e uma obra de empresas diferentes, **When** alguém tenta vinculá-los, **Then** o banco recusa.
3. **Given** uma cotação de outro pedido, **When** alguém tenta selecioná-la, **Then** o banco recusa.
4. **Given** o status de um usuário, **When** um valor fora do conjunto permitido é gravado, **Then** o banco recusa.
5. **Given** as tabelas imutáveis, **When** alguém tenta apagar linhas por vínculo em cascata, anular colunas ou esvaziar a tabela, **Then** a operação é recusada de forma previsível e documentada.
6. **Given** a estrutura do banco no código e as migrações, **When** a CI compara, **Then** qualquer diferença não declarada falha o build, com lista de exceções para os índices escritos à mão.
7. **Given** consultas frequentes por responsável, cliente, obra e ator, **When** o volume cresce, **Then** existem índices para elas.

---

### User Story 10 - Entradas pesadas não derrubam o sistema (Priority: P2)

Como usuário que envia faturas, cotações e evidências, quero que um arquivo malformado ou gigante seja recusado rapidamente com mensagem clara, sem travar o sistema para os demais.

**Why this priority**: hoje o texto de todas as páginas de um PDF é extraído antes do limite de 3 páginas, páginas de tamanho absurdo geram imagens enormes, imagens não têm limite de pixels, uploads inteiros ficam em memória (até cerca de 400 MB por requisição em Compras) e o tipo do arquivo é confiado ao que o navegador declara.

**Independent Test**: enviar um PDF com milhares de páginas, um PDF com página de dimensão gigante, uma imagem com bilhões de pixels e um arquivo executável renomeado para PDF; todos recusados em segundos, sem aumento relevante de memória e sem afetar outras requisições em andamento.

**Acceptance Scenarios**:

1. **Given** um PDF com mais páginas que o limite, **When** enviado, **Then** é recusado antes de qualquer extração.
2. **Given** uma página ou imagem acima do tamanho máximo em pixels, **When** enviada, **Then** é recusada antes de ser desenhada.
3. **Given** um arquivo cujo conteúdo real não corresponde ao tipo declarado, **When** enviado em Faturas, Compras ou Obras, **Then** é recusado.
4. **Given** vários envios simultâneos, **When** o limite total de memória de upload é atingido, **Then** novos envios recebem "tente novamente" e os em andamento terminam.
5. **Given** uma leitura que excede o tempo máximo, **When** o prazo passa, **Then** é interrompida e o usuário recebe mensagem clara.
6. **Given** uma falha do armazenamento, **When** a API responde, **Then** a mensagem ao usuário não expõe detalhes internos.

---

### User Story 11 - Login resistente a abuso e sessões revogáveis (Priority: P2)

Como usuário, quero que ninguém de fora consiga me impedir de entrar nem travar minha conta, e que ao redefinir minha senha qualquer sessão antiga deixe de valer imediatamente.

**Why this priority**: sem a configuração de proxy, todos os usuários compartilham o mesmo limite de tentativas (10 por minuto no total), de modo que um atacante sem conta bloqueia o login de todo mundo; o bloqueio por e-mail permite travar a conta de uma pessoa específica mesmo com a senha certa; os contadores se perdem a cada reinício; a redefinição de senha não derruba o cache de sessão; o cache confia em dados sem autenticação; o login Google aceita qualquer domínio; a redefinição revela quais contas existem pelo tempo de resposta; e segredos de exemplo são aceitos em produção.

**Independent Test**: em ambiente de teste, repetir tentativas falhas contra uma conta e conferir que outra conta continua entrando e que a conta alvo ainda entra com a senha correta; redefinir senha e conferir que a sessão antiga cai na hora; tentar subir o sistema em modo produção com um segredo de exemplo e conferir que ele recusa.

**Acceptance Scenarios**:

1. **Given** vários usuários legítimos atrás do mesmo proxy, **When** um atacante falha logins em massa, **Then** os legítimos continuam entrando.
2. **Given** uma conta alvo de tentativas erradas, **When** o dono entra com a senha correta, **Then** consegue (com atraso progressivo ou desafio para quem erra, nunca recusa de quem acerta).
3. **Given** um reinício do sistema, **When** ele volta, **Then** os contadores de tentativa continuam valendo.
4. **Given** uma senha redefinida, **When** a sessão antiga é usada, **Then** é recusada imediatamente.
5. **Given** que o cache de sessões seja adulterado ou consultado sem credencial, **When** uma sessão forjada é apresentada, **Then** é recusada.
6. **Given** o login Google, **When** o domínio da conta não está na lista permitida, **Then** é recusado.
7. **Given** um pedido de redefinição para e-mail existente e outro inexistente, **When** medidos, **Then** respostas e tempos são indistinguíveis.
8. **Given** o modo produção, **When** um segredo é igual ao valor de exemplo ou tem entropia baixa, **Then** o sistema se recusa a iniciar com mensagem clara.
9. **Given** o atalho de login de desenvolvimento, **When** o ambiente não é local nem de teste, **Then** ele não pode ser ligado, e ligá-lo em ambiente local emite aviso visível na inicialização.

---

### User Story 12 - O frontend fala com a API de forma única, segura e honesta (Priority: P2)

Como usuário e como desenvolvedor, quero que identificadores da URL sejam validados antes de virar chamadas à API, que erro real apareça como erro (e não como dado de exemplo), e que telas sem backend digam que são exemplo.

**Why this priority**: identificadores da URL entram sem validação nem codificação em caminhos da API, o que permite desviar uma chamada autenticada para outra rota; documentos HTML são servidos mesmo quando a API devolve outro tipo; qualquer falha (acesso negado, erro, tempo esgotado) vira silenciosamente dado de exemplo; Dashboard e Pendências mostram números fictícios marcados como "pronto".

**Independent Test**: chamar os proxies com identificadores como `../..` e `%2F`; derrubar a API e conferir mensagens distintas; abrir Dashboard e Pendências e conferir o aviso de exemplo.

**Acceptance Scenarios**:

1. **Given** um identificador malformado na URL, **When** a chamada chega ao frontend, **Then** é recusada com "requisição inválida" antes de chegar à API.
2. **Given** respostas da API, **When** o frontend as recebe, **Then** valida o formato e trata divergência como erro explícito.
3. **Given** acesso negado, não encontrado, indisponível e tempo esgotado, **When** acontecem, **Then** o usuário vê mensagens e telas diferentes para cada caso, e dado de exemplo só aparece com opção explícita de desenvolvimento.
4. **Given** Dashboard e Pendências sem backend real, **When** abertos, **Then** mostram aviso claro de dados de exemplo e o estado da tela não é "pronto".
5. **Given** a URL interna da API, **When** o sistema é empacotado, **Then** ela não vai para o código do navegador e pode mudar sem reconstruir a imagem.
6. **Given** qualquer tela, **When** carrega, falha ou não encontra, **Then** há estado de carregamento, de erro e de "não encontrado" consistentes.
7. **Given** datas e valores, **When** exibidos em qualquer tela, **Then** usam o mesmo fuso (America/Manaus) e o mesmo formato.

---

### User Story 13 - Publicação reversível e sistema observável (Priority: P3)

Como responsável pela operação, quero publicar com versões identificáveis, voltar para a anterior de forma segura, saber a saúde real do sistema e ser avisado quando algo quebra.

**Why this priority**: hoje voltar só troca a imagem e pode deixar código antigo sobre banco novo; a verificação pós-publicação espera um tempo fixo e tenta uma vez; só existem duas versões de imagem; a checagem de saúde diz "ok" sem olhar banco, cache ou armazenamento; não há rastreio de erros, identificador de requisição, registro de acesso ou monitor externo; o log perde o rastreio de pilha; não há limite de memória nem rotação de logs.

**Independent Test**: publicar uma versão que falha na saúde e conferir a volta automática; derrubar o banco de teste e conferir que a saúde reflete; provocar um erro e conferir que ele aparece no rastreador com o identificador da requisição.

**Acceptance Scenarios**:

1. **Given** uma publicação, **When** termina, **Then** a versão é identificável pelo commit e as últimas N versões permanecem disponíveis para reversão.
2. **Given** uma publicação com migração, **When** o código novo falha na saúde, **Then** a volta funciona porque as migrações seguem a regra de compatibilidade com a versão anterior, documentada.
3. **Given** a verificação pós-publicação, **When** o sistema demora a subir, **Then** ela tenta repetidamente até o limite, sem reverter por pressa.
4. **Given** banco, cache ou armazenamento indisponível, **When** a saúde é consultada, **Then** reporta o componente com problema.
5. **Given** um erro em produção, **When** ocorre, **Then** há registro com pilha, identificador da requisição e sem dado pessoal, e o responsável é avisado.
6. **Given** o sistema fora do ar, **When** passa o prazo, **Then** um monitor externo avisa.
7. **Given** os serviços, **When** o consumo cresce, **Then** limites de memória e rotação de logs impedem que um serviço derrube os outros ou encha o disco.

---

### User Story 14 - Esteira de qualidade que realmente protege (Priority: P3)

Como desenvolvedor, quero que a CI rode todos os testes que o projeto tem e todas as verificações que ele promete, e que ela seja rápida e estável.

**Why this priority**: várias suítes existentes não rodam na CI (compras, armazenamento, OCR, LLM, integração de energia, segurança da plataforma, migração do zero, scripts de operação, oráculo). Faltam checagem de deriva do banco, cobertura mínima, build das imagens, análise de scripts de shell e atualização automática de dependências. Ações e imagens base não são fixadas por versão imutável. Os testes da API não passam por checagem de tipos. As regras de lint não pegam promessas esquecidas nem erros de acessibilidade e hooks. Falhas intermitentes ficam escondidas por retentativa.

**Independent Test**: introduzir de propósito uma regressão em cada área e conferir que a CI falha; medir o tempo total da CI antes e depois.

**Acceptance Scenarios**:

1. **Given** o repositório, **When** a CI roda, **Then** executa todas as suítes de teste do projeto, ou cada uma ausente tem justificativa registrada.
2. **Given** uma mudança de estrutura do banco sem migração, **When** a CI roda, **Then** falha.
3. **Given** cobertura abaixo do mínimo acordado nos módulos críticos, **When** a CI roda, **Then** falha.
4. **Given** as imagens, **When** a CI roda, **Then** elas são construídas e verificadas, não só na publicação.
5. **Given** ações, imagens base e dados de terceiros baixados em build, **When** auditados, **Then** estão fixados por versão imutável e verificados por checksum.
6. **Given** uma dependência com atualização de segurança, **When** sai, **Then** um PR automático é aberto.
7. **Given** um teste que só passou na retentativa, **When** a CI termina, **Then** isso é reportado como instável.
8. **Given** a CI, **When** mede o tempo, **Then** usa cache de dependências e navegador e separa trabalhos independentes, com meta de tempo definida.

---

### User Story 15 - Repositórios de dados testados contra o banco de verdade (Priority: P3)

Como desenvolvedor, quero que a lógica de persistência (travas de concorrência, eventos, cálculo de prazos) seja testada contra o banco real, para que um teste verde signifique comportamento real.

**Why this priority**: os testes ponta a ponta substituem os repositórios por versões em memória que divergem do banco (não impõem e-mail único, não validam o catálogo de papéis, numeram diferente). Os maiores repositórios (energia, compras, obras, comercial) não têm teste contra o banco na CI padrão; Obras e Pluggamob quase não têm teste.

**Independent Test**: rodar a suíte de integração com banco real e conferir que as regras de concorrência, unicidade e auditoria são exercitadas.

**Acceptance Scenarios**:

1. **Given** cada repositório com lógica de estado, **When** a suíte roda, **Then** há testes contra o banco real cobrindo transição válida, transição inválida, concorrência e evento gerado.
2. **Given** as versões em memória usadas em testes, **When** divergem do banco, **Then** um teste de contrato as compara com a versão real.
3. **Given** os fluxos de acesso por papel, **When** testados de ponta a ponta, **Then** há usuários de papéis restritos e de empresas diferentes, e as negações são verificadas.
4. **Given** os envios de arquivo, **When** testados de ponta a ponta, **Then** o upload de fatura, cotação e evidência é exercitado.

---

### User Story 16 - Arquitetura da API consistente e documentação verdadeira (Priority: P3)

Como desenvolvedor novo no projeto, quero que cada módulo siga o mesmo desenho e que a documentação diga o que o sistema realmente é.

**Why this priority**: cada módulo resolve camadas de um jeito (regra de negócio e erros HTTP dentro da persistência em alguns, serviços que só repassam em outros); há três adaptadores de armazenamento quase idênticos; o escopo por empresa é duplicado; Compras grava na tabela de Obras; parte da configuração é lida fora da validação de inicialização; fixtures de milhares de linhas entram no build; leitura de fatura, chamada a modelo de linguagem e geração de PDF rodam dentro da requisição; o catálogo de eventos está incompleto; o módulo de LLM não usa os contratos compartilhados; e o guia de agentes ainda diz "Bloco A, só mock", contradizendo o README.

**Independent Test**: verificação automática de fronteiras (nenhum erro HTTP na persistência, nenhum acesso direto a configuração fora do schema, todo evento no catálogo) e leitura cruzada da documentação.

**Acceptance Scenarios**:

1. **Given** uma regra de negócio, **When** localizada, **Then** está em um lugar previsível e testável sem banco, e a persistência não lança erros HTTP.
2. **Given** os três adaptadores de armazenamento, **When** refatorados, **Then** há um único componente com política de falha configurável e os módulos o usam.
3. **Given** o escopo por empresa, **When** usado por Compras, Obras e os demais módulos, **Then** vem de um único componente compartilhado.
4. **Given** cada tabela, **When** consultada, **Then** tem um único módulo dono, e os outros pedem a ele por interface pública.
5. **Given** variáveis de ambiente, **When** o sistema inicia, **Then** todas são validadas num só lugar e um valor inválido impede o início com mensagem clara.
6. **Given** os eventos de auditoria, **When** registrados, **Then** todos os nomes vêm do catálogo compartilhado, em um padrão único de nomenclatura, por um único componente.
7. **Given** o módulo de LLM, **When** o web e a API trocam dados, **Then** os tipos vêm do pacote compartilhado.
8. **Given** fixtures e ferramentas de teste, **When** o build de produção é gerado, **Then** não estão incluídas.
9. **Given** os guias, **When** lidos, **Then** descrevem o estado atual (em produção, integrações permitidas por ADR) e a CI descrita é a que realmente roda.

---

### User Story 17 - Higiene do produto entregue (Priority: P3)

Como dono do produto, quero que o sistema entregue só o que usa e que tenha licença para o que distribui.

**Why this priority**: fontes de avaliação com licença de "uso pessoal" são servidas publicamente, há código morto e permissões de rede (CSP) para serviços que ninguém usa, a página de catálogo de design é acessível em produção, e há componentes de 600 a 1.600 linhas que dificultam manutenção.

**Independent Test**: inventário dos recursos servidos publicamente com licença conferida; abertura da página de catálogo de design em produção deve falhar.

**Acceptance Scenarios**:

1. **Given** as fontes publicadas, **When** auditadas, **Then** todas têm licença compatível com uso comercial ou foram removidas.
2. **Given** o código sem uso, **When** removido, **Then** a política de segurança de conteúdo deixa de permitir os hosts externos correspondentes.
3. **Given** a página de catálogo de design, **When** acessada em produção, **Then** não está disponível.
4. **Given** os componentes acima de um limite de tamanho acordado, **When** a CI mede, **Then** exceções são listadas e novas violações falham.

---

### Edge Cases

- Uma publicação é solicitada enquanto uma migração está em andamento ou enquanto o backup diário roda.
- O responsável pela aprovação de publicação não responde dentro do prazo.
- Uma pessoa pertence às duas empresas, ou muda de empresa, e tem registros nas duas.
- Registros existentes não têm empresa dona e não é possível inferi-la com segurança (ficam em fila de decisão manual, não são adivinhados).
- Duplicatas existentes impedem aplicar uma restrição de unicidade.
- A cópia externa de backup está inacessível na hora da verificação (alerta, sem apagar a anterior).
- A restauração de teste não pode usar dados reais fora do ambiente descartável.
- Um pedido de apagamento colide com a imutabilidade do log de eventos e com a retenção legal (obrigação fiscal ou contratual).
- O arquivo reaparece com tipo correto mas conteúdo truncado ou criptografado por senha.
- Uma migração de banco precisa ser desfeita depois que o código novo já escreveu dados no formato novo.
- O monitor externo ou o rastreador de erros ficam fora do ar (o sistema continua funcionando e não falha por causa deles).
- Uma rota pública legítima nova é esquecida na lista de públicas (o teste de inventário a recusa até ser declarada).
- Usuário existente com sessões abertas durante a mudança de política de escopo (as sessões continuam, mas as consultas passam a respeitar o escopo).

## Requirements *(mandatory)*

### Functional Requirements

**Publicação e servidor**

- **FR-001**: A publicação automática MUST disparar somente a partir de CI concluído com sucesso de um push na branch principal do repositório oficial, nunca de PR, fork ou outra origem.
- **FR-002**: A publicação MUST exigir aprovação explícita de responsável nomeado antes de tocar o servidor de produção.
- **FR-003**: A publicação MUST usar permissões mínimas, tempo máximo de execução e execução exclusiva (uma por vez, sem pular nem inverter a ordem).
- **FR-004**: Os caminhos de publicação (automático e manual) MUST compartilhar a mesma trava e o mesmo procedimento, de modo que um não corrompa o outro.
- **FR-005**: Alterações em workflows e scripts de publicação MUST exigir revisão de responsável designado.
- **FR-006**: A execução de trabalhos de CI vindos de PR MUST NOT ocorrer no servidor de produção.

**Dados de cliente no repositório**

- **FR-007**: A árvore do repositório MUST NOT conter CNPJ, CPF, unidade consumidora, nome de cliente ou valores de fatura reais; fixtures MUST ser sintéticas e declaradas como tal.
- **FR-008**: A CI MUST rodar um verificador de dados de cliente (CNPJ e CPF válidos, unidades consumidoras, nomes de uma lista de clientes) que falhe o build ao encontrar ocorrência fora de fixtures declaradas.
- **FR-009**: Os dados reais usados em regressão MUST ficar no armazenamento privado do corpus, com acesso de leitura controlado.
- **FR-010**: O histórico do git MUST ser reescrito para remover de vez os dados reais de clientes (decisão do dono em 2026-10-05). O procedimento MUST: ser feito com a `main` congelada e após o merge dos PRs em andamento; cobrir todas as branches e tags; tratar também as referências de PR do GitHub (`refs/pull/*`) e o cache de visualização, o que exige pedido de limpeza ao suporte do GitHub; invalidar e refazer todos os clones e forks conhecidos; e ser seguido de nova varredura do histórico inteiro que prove 0 ocorrências. Cópias já feitas por terceiros não podem ser desfeitas e devem ser tratadas como exposição já ocorrida para fins de LGPD.

**Backup e recuperação**

- **FR-011**: O backup diário MUST cobrir o banco e todos os baldes de negócio, com cópia criptografada **no Backblaze B2** (decisão do dono em 2026-10-05), fora do servidor de produção. A criptografia MUST ser feita antes do envio, com chave guardada fora da VPS e fora do próprio B2, e o acesso ao destino MUST usar chave restrita de escrita (a de produção não pode apagar nem sobrescrever cópias antigas; o bucket usa retenção/versionamento imutável pelo prazo da política).
- **FR-012**: O sistema MUST verificar periodicamente (no mínimo semanal) que a cópia mais recente restaura em ambiente descartável, comparando contagens e checksums, e MUST registrar o resultado.
- **FR-013**: Falha ou atraso do backup ou da verificação MUST gerar aviso ao responsável por canal que ele realmente lê.
- **FR-014**: Script de backup, agendamento e configuração do proxy reverso MUST ser versionado no repositório e instalado pela publicação.
- **FR-015**: Credenciais de backup MUST NOT ficar visíveis em listagem de processos ou inspeção de contêiner.
- **FR-016**: MUST existir procedimento de recuperação de desastre escrito, testado e com tempo medido.

**Isolamento e autorização**

- **FR-017**: Todo registro de negócio MUST ter uma empresa dona, e toda leitura, listagem, alteração e aprovação MUST respeitar o escopo de empresa (e departamento onde aplicável) do usuário, com resposta "não encontrado" para registro de outra empresa.
- **FR-018**: A migração de dados existentes para atribuir empresa dona MUST ser aditiva, reversível, sem perda, e MUST deixar para decisão manual os registros cuja empresa não possa ser inferida [NEEDS CLARIFICATION: quais módulos pertencem a qual empresa (Clientes, Comercial, Energia, Eficiência energética e Pluggamob são só da Plugga, ou há clientes e ciclos da Waze?).].
- **FR-019**: A concessão de papéis MUST ser limitada às empresas e papéis que o concedente administra; papel concedido em uma empresa MUST NOT valer em outra.
- **FR-020**: Toda rota MUST declarar explicitamente se é pública ou quais papéis exige; rota sem declaração MUST ser negada.
- **FR-021**: Um teste automático MUST inventariar todas as rotas e falhar se alguma não declarar acesso ou se a lista de públicas divergir da aprovada.
- **FR-022**: Parâmetros de identificador em rotas MUST ser validados com formato correto, e valor malformado MUST resultar em "requisição inválida".
- **FR-023**: O mecanismo de autenticação por sessão MUST ter nome e responsabilidade distintos do atalho de desenvolvimento, e o atalho MUST ser impossível fora de ambiente local ou de teste.

**Integrações**

- **FR-024**: Toda chamada de rede para serviço externo MUST passar por verificação do modo da integração (`mock`, `read_only`, `bridge`, `write`) e MUST NOT ocorrer em modo que não a permita.
- **FR-025**: Em `mock`, a integração MUST devolver resultado simulado, identificado como tal e auditado, sem tráfego externo.
- **FR-026**: Mudança de modo MUST ser auditada com autor e horário.
- **FR-027**: Se alguma integração for excluída do modelo de modo, a exceção MUST estar registrada em ADR.

**Consistência e auditoria**

- **FR-028**: Aprovar e enviar estudo, assinar APR, conferir EPI, registrar e revogar liberação, lançar pendência e medição, criar versão de projeto, ganhar oportunidade, numerar pedido, aprovar fechamento e alterar acesso de equipe MUST ser atômicos, condicionados ao estado de origem e MUST gerar evento de auditoria na mesma operação.
- **FR-029**: A plataforma MUST sempre manter pelo menos um administrador, mesmo sob concorrência.
- **FR-030**: Conflito de concorrência e violação de unicidade MUST resultar em resposta de conflito (409) com mensagem em português; numeração disputada MUST ser repetida automaticamente sem erro ao usuário.
- **FR-031**: Mensagens de erro MUST seguir um envelope único (código e mensagem) em português, sem detalhes internos.
- **FR-032**: Colunas de autoria e aprovação MUST referenciar usuários existentes.
- **FR-033**: Indicadores de Compras MUST considerar todo o período pedido, independentemente do volume, e MUST avisar se o resultado for parcial.

**Privacidade**

- **FR-034**: Eventos de auditoria MUST NOT conter valores de dados pessoais (nome, telefone, e-mail, CNPJ/CPF); MUST conter identificadores e nomes dos campos alterados.
- **FR-035**: MUST existir política de retenção por categoria de dado pessoal, e sessões expiradas (com IP e agente de navegação) MUST ser removidas automaticamente no prazo definido.
- **FR-036**: MUST existir procedimento documentado e verificável para atender pedido de apagamento de titular, incluindo o tratamento dos registros imutáveis.

**Banco de dados**

- **FR-037**: O banco MUST impor unicidade de cliente (e-mail e identificador externo), de unidade consumidora (cliente e código) e de fornecedor (empresa e documento), depois de resolvidas as duplicatas existentes.
- **FR-038**: O banco MUST impor que obra, fornecedor, pedido e cotação vinculados pertençam à mesma empresa e ao mesmo pedido.
- **FR-039**: Status de usuário e demais estados controlados MUST ter conjunto válido imposto pelo banco; mês de competência MUST estar entre 1 e 12.
- **FR-040**: Vínculos das tabelas imutáveis MUST NOT conflitar com a regra de imutabilidade, e as tabelas MUST ser protegidas também contra esvaziamento.
- **FR-041**: A CI MUST detectar divergência entre a estrutura declarada no código e as migrações, com lista explícita de exceções (índices escritos à mão).
- **FR-042**: Colunas de vínculo e consulta frequente MUST ter índice.
- **FR-043**: Todas as migrações MUST ser compatíveis com a versão anterior do código (expandir antes de contrair) e MUST ter plano de reversão documentado.

**Entradas e arquivos**

- **FR-044**: O sistema MUST recusar, antes de qualquer processamento, PDFs acima do limite de páginas, páginas ou imagens acima do limite de dimensão e arquivos cujo conteúdo não corresponda ao tipo permitido.
- **FR-045**: Uploads MUST ter limite total de memória por requisição e simultâneo, e leitura de arquivo MUST ter tempo máximo.
- **FR-046**: Leitura de fatura, chamada a modelo de linguagem e geração de PDF MUST NOT bloquear a requisição que atende outros usuários; o usuário MUST poder consultar o andamento. [Premissa: pode ser entregue em fatia posterior desta feature.]

**Autenticação e sessão**

- **FR-047**: Limites de tentativa de login MUST ser por origem real do cliente e por conta, MUST sobreviver a reinícios e MUST NOT impedir quem informa a senha correta; um atacante sem credenciais MUST NOT conseguir bloquear o login dos demais.
- **FR-048**: Redefinição de senha e desativação MUST invalidar imediatamente todas as sessões, inclusive as em cache.
- **FR-049**: O cache de sessões MUST exigir credencial de acesso e MUST NOT confiar em conteúdo adulterável.
- **FR-050**: O login Google MUST aceitar apenas domínios da lista permitida e MUST exigir correspondência entre o domínio verificado e o do e-mail.
- **FR-051**: A resposta e o tempo de resposta de pedido de redefinição MUST ser indistinguíveis entre conta existente e inexistente.
- **FR-052**: Em produção, o sistema MUST recusar iniciar com segredo igual ao valor de exemplo, vazio ou de baixa entropia, e MUST validar a configuração de segredos na inicialização.
- **FR-053**: Rotas de mutação MUST ter defesa contra requisição forjada também do lado da API, sem depender só do frontend.

**Frontend**

- **FR-054**: O frontend MUST ter um único mecanismo de acesso à API no servidor, com tempo máximo, repasse de sessão e de origem do cliente, codificação de parâmetros, validação do formato das respostas e erros tipados (não autorizado, proibido, não encontrado, indisponível).
- **FR-055**: Conteúdo HTML MUST ser servido como tal somente quando a API o declarar assim.
- **FR-056**: Dado de exemplo MUST aparecer apenas por opção explícita de desenvolvimento ou em telas marcadas como exemplo, com aviso visível; o estado de cada tela MUST refletir a realidade.
- **FR-057**: Todas as telas MUST ter estados de carregamento, erro e não encontrado.
- **FR-058**: A URL interna da API MUST ser configuração de execução do servidor, nunca incluída no código do navegador.
- **FR-059**: Datas e valores MUST ser formatados por um componente único com fuso America/Manaus.
- **FR-060**: Tipos e validações de requisição e resposta entre web e API MUST vir do pacote compartilhado, incluindo o módulo de LLM.

**Operação e observabilidade**

- **FR-061**: Cada publicação MUST gerar versão identificável por commit, com as últimas N versões preservadas para reversão, e a verificação pós-publicação MUST repetir até o limite antes de reverter.
- **FR-062**: A verificação de saúde MUST ter modo de vida (processo no ar) e de prontidão (banco, cache e armazenamento acessíveis), e a publicação MUST usar a prontidão.
- **FR-063**: Erros em produção MUST ser capturados com pilha e identificador de requisição, sem dado pessoal, e o responsável MUST ser avisado; cada requisição MUST ter identificador e registro de acesso.
- **FR-064**: Um monitor externo MUST avisar quando o sistema ficar indisponível.
- **FR-065**: O registro (log) MUST preservar pilha e todos os parâmetros dos erros.
- **FR-066**: Cada serviço MUST ter limite de memória e CPU, rotação de logs e verificação de saúde; as imagens MUST conter apenas o necessário para execução.

**Esteira e testes**

- **FR-067**: A CI MUST executar todas as suítes de teste existentes (incluindo as hoje condicionadas a flag), a checagem de tipos dos testes, lint com regras de tipo (promessas, hooks, acessibilidade) e verificação de scripts de shell.
- **FR-068**: A CI MUST impor cobertura mínima nos módulos críticos, construir as imagens e reportar testes que só passaram em retentativa.
- **FR-069**: Ações, imagens base e arquivos de terceiros baixados em build MUST ser fixados por versão imutável e verificados por checksum, e as dependências MUST ser atualizadas por mecanismo automático com revisão.
- **FR-070**: Cada repositório com lógica de estado MUST ter testes contra banco real (transição, concorrência, evento), e as versões em memória MUST ter teste de contrato contra a real.
- **FR-071**: Testes ponta a ponta MUST incluir usuários de papéis restritos e de empresas diferentes, verificação de negação e envio de arquivos.
- **FR-072**: As regras de fronteira entre web, API e pacotes MUST ser verificadas por análise que entende módulos, e testadas.

**Arquitetura e documentação**

- **FR-073**: Regras de negócio MUST ficar em lugar previsível e testável sem banco; a camada de persistência MUST NOT lançar erros HTTP; cada tabela MUST ter um único módulo dono.
- **FR-074**: Acesso a armazenamento de objetos e escopo por empresa MUST vir de componentes únicos compartilhados.
- **FR-075**: Toda variável de ambiente MUST ser lida por um único mecanismo validado na inicialização, sem valores padrão divergentes.
- **FR-076**: Todos os nomes de evento MUST vir do catálogo compartilhado, em padrão único, registrados por um único componente.
- **FR-077**: Fixtures e ferramentas de teste MUST NOT entrar no build de produção.
- **FR-078**: Fontes sem licença comercial, código sem uso, hosts externos desnecessários na política de conteúdo e páginas internas de catálogo MUST ser removidos ou bloqueados em produção.
- **FR-079**: A documentação (guia de agentes, README, guia de operação, ADRs) MUST descrever o estado real do sistema e da CI; mudanças de fronteira, persistência, auth, integração, auditoria ou jobs MUST gerar ou atualizar ADR.

**Não regressão**

- **FR-080**: Nenhuma mudança desta feature MUST reduzir as bases a preservar listadas abaixo, e MUST haver teste que comprove cada uma antes de mexer na área.

### Key Entities

- **Empresa dona**: atributo de todo registro de negócio que indica a qual empresa (Plugga ou Waze) pertence; base do escopo de leitura e escrita.
- **Escopo de acesso**: conjunto de empresas, departamentos e papéis que um usuário pode exercer; concedido por quem administra a empresa.
- **Declaração de acesso da rota**: a regra explícita de cada rota (pública ou lista de papéis); sem declaração, acesso negado.
- **Modo da integração**: estado (`mock`, `read_only`, `bridge`, `write`) que define se uma chamada externa pode ocorrer.
- **Evento de auditoria**: registro imutável de quem fez o quê e quando, com identificadores e nomes de campos, sem dado pessoal.
- **Política de retenção**: regra por categoria de dado pessoal com finalidade, prazo e responsável.
- **Versão publicada**: imagem identificável por commit, com estado de saúde e referência da migração compatível.
- **Cópia de segurança**: conjunto de banco e arquivos copiado para fora do servidor, com resultado da última restauração de teste.
- **Aprovação de publicação**: decisão registrada de um responsável nomeado para uma versão específica.
- **Fixture sintética**: dado de teste fabricado, declarado como tal, que substitui dado real.

## Bases a preservar (não regredir)

Sessões opacas guardadas só por hash; cookie assinado, `httpOnly` e `Secure`; senhas com Argon2id e tempo igual para conta inexistente; tokens de convite e redefinição de uso único; política de conteúdo com nonce e cabeçalhos de segurança; tratamento de redirecionamento aberto; política de proxy confiável do ADR-0012; validação de ambiente que falha na inicialização; travas otimistas em Comercial, Obras, Compras e Auth; datas com fuso e dinheiro com precisão decimal; restrições de invariantes no banco; papel de banco só com escrita de dados; gatilhos de imutabilidade; gate do Bitrix; portas presas ao endereço local; contêineres sem privilégio de administrador; criptografia dos segredos do sistema.

## Ordem de ataque

Princípio: primeiro fechar o que permite dano externo imediato e não exige parar o sistema; depois o que muda dados (migrações aditivas, com reversão); depois o que melhora a capacidade de evoluir. Cada fatia é publicada sozinha e reversível.

1. **Fatia 1, sem tocar dados nem código da aplicação**: US1 (publicação segura), US2 (parte da CI e dos arquivos; histórico depende da decisão), US3 (backup externo e alerta, sem alterar o sistema), US5 (inventário de rotas, em modo de aviso antes de bloquear).
2. **Fatia 2, correções de código sem migração**: US6 (gate de modo), US7 (atomicidade e auditoria onde não exige migração), US10 (limites de entrada), US11 (login e segredos), US12 (frontend), parte de US8 (parar de gravar dado pessoal em eventos).
3. **Fatia 3, migrações aditivas**: US4 (empresa dona), US9 (restrições e índices, após resolver duplicatas), vínculos de autoria de US7, retenção de US8. Cada migração tem backup restaurado antes e plano de reversão.
4. **Fatia 4, sustentação**: US13, US14, US15, US16, US17.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em simulação de CI vindo de PR, de fork e de push na branch principal, 100% dos casos que não são push oficial aprovado resultam em nenhuma publicação em produção.
- **SC-002**: O verificador de dados de cliente encontra 0 ocorrências fora de fixtures declaradas na árvore do repositório, e falha em 100% das tentativas de reintrodução em teste.
- **SC-003**: Após uma perda total do servidor, o banco e todos os arquivos de negócio são recuperados com perda de no máximo 24 horas de dados, e o tempo de recuperação medido em ensaio é menor que o objetivo definido pelo dono (premissa: 4 horas).
- **SC-004**: A restauração de teste roda ao menos semanalmente e as 4 últimas execuções estão registradas com contagens e checksums iguais.
- **SC-005**: Uma falha de backup chega ao responsável em até 1 hora do prazo esperado.
- **SC-006**: Em teste com usuários de empresas diferentes e mesmo papel, 100% das tentativas de acessar registros da outra empresa, por qualquer rota, são negadas sem revelar existência.
- **SC-007**: 100% das rotas da API declaram acesso explícito, verificado por teste automático a cada mudança.
- **SC-008**: Nenhuma chamada de rede para serviço externo ocorre com a integração em `mock`, verificado por teste para cada integração.
- **SC-009**: Em 1.000 execuções concorrentes de cada operação crítica, 0 estados parciais, 0 aprovações duplicadas, 0 clientes órfãos e exatamente 1 evento de auditoria por efeito.
- **SC-010**: Nenhuma resposta de erro dessas operações usa status de erro interno para conflito; 100% dos conflitos retornam 409 com mensagem em português.
- **SC-011**: 0 valores de dados pessoais nos eventos de auditoria novos, e o procedimento de apagamento é executado em ensaio com resultado verificado.
- **SC-012**: Arquivos hostis de teste (milhares de páginas, página gigante, imagem de bilhões de pixels, tipo falso) são recusados em menos de 3 segundos cada, sem aumento de memória acima de 100 MB e sem degradar outras requisições.
- **SC-013**: Em ataque simulado de tentativas de login, usuários legítimos continuam entrando em 100% das tentativas com senha correta.
- **SC-014**: Uma sessão antiga deixa de valer em menos de 5 segundos após redefinição de senha ou desativação.
- **SC-015**: O sistema não inicia em modo produção com nenhum dos segredos de exemplo, verificado em teste.
- **SC-016**: Em teste, identificadores malformados em qualquer rota do frontend resultam em "requisição inválida" em 100% dos casos, sem chamada à API.
- **SC-017**: O usuário distingue por mensagem e tela os casos de acesso negado, não encontrado, indisponível e tempo esgotado, e nenhuma tela mostra dado de exemplo sem aviso visível.
- **SC-018**: Uma publicação com falha de saúde reverte sozinha em até 5 minutos, e as últimas 5 versões ficam disponíveis para voltar.
- **SC-019**: A consulta de prontidão reflete a falha de banco, cache ou armazenamento em até 30 segundos.
- **SC-020**: Qualquer indisponibilidade acima de 2 minutos gera aviso ao responsável.
- **SC-021**: A CI executa 100% das suítes existentes (ou a justificativa de cada ausência está registrada), falha em regressão introduzida de propósito em cada uma das áreas, e termina em até 15 minutos com cache.
- **SC-022**: 0 testes de repositório dependem exclusivamente de versão em memória para validar regra de concorrência ou unicidade.
- **SC-023**: Um desenvolvedor novo encontra onde uma regra de negócio mora e como testá-la em menos de 10 minutos, e a documentação não contradiz o estado real (verificado por leitura cruzada).
- **SC-024**: 0 fontes sem licença comercial publicadas, 0 hosts externos na política de conteúdo sem uso comprovado.
- **SC-025**: Nenhuma das bases a preservar regride, comprovado por teste antes e depois de cada fatia.
- **SC-026**: Nenhuma fatia exige indisponibilidade planejada do sistema; qualquer exceção tem janela, aprovação e plano de reversão registrados antes.

## Assumptions

- O sistema continua em uma única VPS com Docker Compose; migrar de provedor ou de arquitetura de hospedagem está fora desta feature.
- O repositório oficial é `zynox-ia/plugga-os`; o dono do sistema é a pessoa que aprova publicações e decisões de dados. Há pelo menos um segundo responsável reserva para aprovações.
- O repositório pode ser privado ou público; a spec trata o caso de fork como risco real em ambos.
- Um runner de CI dedicado, separado do servidor de produção, é premissa desejável para FR-006; se o custo for impeditivo, a alternativa aceitável é rodar apenas o deploy no servidor e levar os testes para runner hospedado. A escolha é decisão de plano.
- A política de retenção de dados pessoais usa, até definição do dono, prazos conservadores: sessões 30 dias após expirar; eventos sem valores pessoais indefinidamente; dados de cliente enquanto durar a relação contratual mais o prazo legal aplicável. A validação jurídica final cabe ao dono.
- A atribuição da empresa dona aos registros existentes segue a decisão do dono (FR-018); enquanto não houver decisão, a aplicação reconhece como padrão a empresa Plugga para os módulos de energia, clientes e Pluggamob e deixa em fila de decisão manual o que for duvidoso.
- Sem usuários externos ainda e com poucas pessoas internas, uma janela curta de manutenção é aceitável, mas não é premissa de nenhuma fatia (SC-026).
- Meta de recuperação: perda máxima de 24 horas (backup diário) e retomada em até 4 horas.
- Provedores externos já em uso (Brevo, OpenRouter, Google) continuam; esta feature não os troca.
- A migração de leitura de fatura para processamento assíncrono (FR-046) pode ser entregue em fatia posterior sem bloquear as demais, desde que os limites de FR-044 e FR-045 já estejam em vigor.
- Os dados de teste e a restauração de ensaio rodam em ambiente descartável isolado, nunca contra o banco ou os arquivos de produção.
- Esta feature depende de: conta e chaves do Backblaze B2 criadas pelo dono (FR-011), decisão sobre o modelo de empresa (FR-018); acesso administrativo à VPS para instalar backup e monitoramento; e das specs e ADRs existentes (0005, 0007, 0008, 0011, 0012) como referência.
