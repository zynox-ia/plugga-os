import type { Metadata } from "next";

import { PublicLegalLayout } from "../components/public-legal-layout";

export const metadata: Metadata = { title: "Termos de uso — plugga-os" };

export default function TermosPage() {
  return (
    <PublicLegalLayout>
      <h1>termos de uso</h1>
      <p className="legal-lead">
        O plugga-os é um sistema interno de uso corporativo. Estes termos definem
        o uso da plataforma por pessoas autorizadas pela empresa.
      </p>

      <h2>Acesso autorizado</h2>
      <p>
        O acesso é pessoal e intransferível. Use apenas a conta disponibilizada
        para você e mantenha sua senha em sigilo. Não compartilhe credenciais nem
        utilize a conta de outra pessoa.
      </p>

      <h2>Uso da plataforma</h2>
      <p>
        Utilize o sistema exclusivamente para atividades profissionais
        autorizadas. Os dados, documentos, registros e relatórios acessados pela
        plataforma devem ser tratados conforme as políticas internas da empresa.
      </p>

      <h2>Responsabilidades</h2>
      <p>
        Você é responsável pelas informações que registra e pelas ações que
        confirma usando sua conta. Comunique imediatamente ao administrador
        qualquer suspeita de acesso indevido ou uso não autorizado.
      </p>

      <h2>Disponibilidade e alterações</h2>
      <p>
        A empresa pode atualizar a plataforma, restringir acessos ou alterar
        estes termos quando necessário para a operação, segurança ou conformidade
        do sistema.
      </p>

      <h2>Privacidade</h2>
      <p>
        O tratamento de dados pessoais segue a{" "}
        <a href="/privacidade">Política de privacidade</a> do plugga-os.
      </p>
    </PublicLegalLayout>
  );
}
