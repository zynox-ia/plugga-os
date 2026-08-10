import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidade — Plugga OS" };

/**
 * Página pública de privacidade.
 *
 * Existe por exigência concreta: a tela de consentimento do Google Cloud pede
 * uma política de privacidade acessível sem login, e o app OAuth não é
 * publicado sem ela. Descreve o que o login federado realmente faz — que é
 * pouco — em vez de um texto genérico que não corresponderia ao sistema.
 */
export default function PrivacidadePage() {
  return (
    <main className="legal-page">
      <h1>Política de privacidade — Plugga OS</h1>
      <p className="legal-lead">
        O Plugga OS é um sistema interno de uso corporativo, hospedado na
        infraestrutura da própria empresa. Não é um serviço aberto ao público e
        não cria contas por conta própria: só entra quem já foi cadastrado ou
        convidado por um administrador.
      </p>

      <h2>Entrar com o Google</h2>
      <p>
        Quando alguém usa o botão “Entrar com o Google”, o Google nos informa
        apenas um identificador permanente da conta, o endereço de e-mail, a
        confirmação de que esse e-mail foi verificado e, quando existir, o
        domínio corporativo do Google Workspace.
      </p>
      <p>
        Guardamos o identificador da conta Google, os endereços de e-mail
        observados e o domínio corporativo, exclusivamente para reconhecer a
        mesma pessoa nos acessos seguintes e para permitir auditoria de quem
        entrou. Não guardamos tokens de acesso nem de atualização.
      </p>
      <p>
        Não pedimos e não temos acesso a Gmail, Google Drive, Agenda, Contatos
        ou a qualquer outro serviço do Google. As permissões solicitadas se
        limitam à identificação básica (<code>openid</code>, <code>email</code> e{" "}
        <code>profile</code>).
      </p>

      <h2>Quem decide o acesso</h2>
      <p>
        O Google apenas comprova a identidade. Quem pode entrar, o que enxerga e
        quando perde o acesso é decidido no banco de dados da própria empresa. A
        desativação de uma conta encerra imediatamente as sessões e bloqueia
        todos os meios de entrada, inclusive o Google.
      </p>

      <h2>Dados de uso e registro</h2>
      <p>
        Registramos eventos de autenticação — entrada bem-sucedida, tentativa
        recusada, encerramento de sessão e vínculo de conta — com o
        identificador interno da pessoa, a data e a hora. Endereços de e-mail
        aparecem nesses registros apenas de forma mascarada e somente quando não
        foi possível identificar um usuário.
      </p>

      <h2>Contato</h2>
      <p>
        Dúvidas sobre estes dados devem ser encaminhadas ao administrador do
        Plugga OS na sua empresa.
      </p>
    </main>
  );
}
