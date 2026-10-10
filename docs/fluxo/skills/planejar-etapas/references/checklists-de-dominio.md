# Checklists de domínio

Use para **mostrar o menu** ao André: o que uma feature completa costuma ter. Ele escolhe o que entra.
O padrão é sempre o menor escopo que cumpre o objetivo; itens além disso precisam da escolha dele.
(Fontes: OWASP Cheat Sheets, PCI DSS, twelve-factor app.)

## Autenticação
- Hash de senha forte (argon2id ou bcrypt), nunca reversível
- Mensagem de erro que não revela se o usuário existe
- Sessão com expiração e encerramento no logout e na troca de senha
- Limite de tentativas de login
- "Esqueci a senha" com link de uso único e validade curta
- Verificação de e-mail no cadastro
- Autenticação em dois fatores (perguntar se o sistema lida com dinheiro ou dados sensíveis)
- Registro de eventos de segurança, sem dados sensíveis

## Permissões
- Acesso negado por padrão
- Verificar se o recurso pertence a quem pede (usuário A não abre o registro de B trocando o ID na URL)

## Dados
- Migrations versionadas e reversíveis
- Regras de integridade no banco (obrigatoriedade, unicidade)
- Índices para as buscas reais
- Backup com restauração testada
- Política de retenção para dados pessoais (LGPD)

## API e integrações
- Autenticação em toda rota, exceto as públicas declaradas
- Validação de entrada
- Limite de requisições
- Respostas só com o necessário
- Erros sem detalhes internos em produção

## Uploads
- Tipos permitidos verificados pelo conteúdo, não só pela extensão
- Limite de tamanho
- Arquivo guardado com nome gerado pelo sistema

## Pagamentos
- O servidor nunca recebe o número do cartão (usar o provedor)
- Webhooks com verificação de assinatura
- Operações que não cobram duas vezes se repetidas

## Notificações e e-mail
- Provedor configurável
- Envio em fila com nova tentativa
- E-mails sem dados sensíveis

## Observabilidade
- Logs estruturados sem segredos
- Alerta quando algo crítico falha

## Configuração e deploy
- Configuração por variáveis de ambiente
- Segredos fora do repositório
- Possibilidade de voltar à versão anterior

## Performance
- Paginação em listas
- Sem consultas repetidas em laço nas telas principais
- Cache só onde a lentidão foi medida
