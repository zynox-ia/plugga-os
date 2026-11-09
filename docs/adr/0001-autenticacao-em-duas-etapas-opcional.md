---
status: accepted
---

# Autenticação em duas etapas opcional

A autenticação em duas etapas será opcional para qualquer usuário humano da equipe, por escolha do titular da conta nas configurações de segurança, usando aplicativo autenticador (TOTP). Nenhum papel terá ativação obrigatória. Depois de ativada, a proteção valerá em todos os novos logins por senha e Google, até que o titular a desative mediante confirmação de segurança. A integração Google atual comprova a identidade, mas não entrega à Plugga uma confirmação verificável de segundo fator; exigir o fator próprio nos dois caminhos impede que a escolha do provedor contorne a proteção ativada pelo usuário.

Depois da confirmação do segundo fator, serão mantidos os prazos da PLU-311: sete dias com permanência selecionada e doze horas sem ela, contados desde o login completo e sem extensão do teto por atividade. Essa escolha preserva a continuidade da sessão, sem criar uma dispensa de 2FA para logins futuros. Quem não ativar mantém o login atual, sem recadastro ou desconexão por papel.

A ativação só será concluída após confirmar o primeiro código do autenticador e apresentar os códigos de recuperação; abandonar uma configuração incompleta manterá o acesso anterior. Um código de recuperação de uso único poderá substituir o TOTP após a autenticação primária, sem desativar o 2FA. Trocar o autenticador invalidará o anterior e os códigos antigos. A ativação, a troca e a desativação feitas pelo próprio titular encerrarão as outras sessões anteriores da conta, preservando a sessão atual que concluiu a confirmação exigida. A remoção por Desenvolvedor ou pelo procedimento emergencial revogará todas as sessões da conta afetada.

A primeira ativação exigirá um login completo feito nos últimos cinco minutos, tanto ao iniciar a configuração quanto ao confirmar o primeiro código. Uma sessão antiga pedirá novo login por senha ou Google. Isso impede que a posse de um cookie antigo permita cadastrar um autenticador e encerrar as sessões do titular.

Trocar o autenticador, gerar novos códigos de recuperação e desativar a própria proteção exigirão confirmação do segundo fator nos últimos cinco minutos, independentemente do papel. A confirmação pode usar o app ou um código de recuperação ainda não utilizado. Quem acabou de confirmar o fator poderá realizar a ação sem repetir o desafio nessa janela.

A janela de cinco minutos contará da confirmação efetiva do fator. Regenerar códigos ou realizar outra ação dentro dela não prorrogará essa confirmação.

Redefinir a senha por e-mail não removerá o segundo fator. Se o titular perder o autenticador e os códigos de recuperação, somente um Desenvolvedor poderá remover a proteção de outra conta mediante solicitação, sem etapa de conferência ao vivo. Esse poder alcança outras contas Admin, Desenvolvedor, Gerente e Membro; Admin não recebe essa permissão. A remoção por terceiro exige que o Desenvolvedor tenha seu próprio 2FA ativo e confirmado nos últimos cinco minutos, com registro de auditoria. O titular volta ao login habitual e decide se deseja ativar o 2FA novamente, sem recadastro forçado.

Sem outro Desenvolvedor habilitado para recuperar a conta, permanece o procedimento emergencial fora da tela de login, autorizado pelo André e auditado, com encerramento das sessões anteriores. Essa exceção operacional permite recuperar a última conta protegida sem criar um código permanente de dispensa de 2FA.

Definição confirmada pelo André e registrada na [PLU-321](https://linear.app/zynox-dev/issue/PLU-321/feature-implementar-autenticacao-em-duas-etapas-opcional-para-usuarios).
