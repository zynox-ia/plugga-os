import type { Metadata } from "next";

import { AuthCard } from "../../../components/auth/auth-card";
import { GoogleComplete } from "../../../components/auth/google-complete";

export const metadata: Metadata = { title: "Entrando — plugga-os" };

/**
 * Rota NÃO pública de propósito: o middleware exige sessão válida para chegar
 * aqui. Assim quem cair nesta URL sem ter passado pelo callback é mandado ao
 * /login como em qualquer outra tela, e a página nunca é um caminho de saída
 * utilizável por quem não autenticou.
 */
export default function GoogleCompletePage() {
  // Sem `singlePanel`: essa prop pertence ao redesenho das telas de auth, que
  // ainda não está entregue. Uma tela que vive milissegundos não é motivo para
  // acoplar este fluxo a trabalho de outra pessoa em andamento — e o layout
  // padrão é o mesmo do /login, de onde a pessoa acabou de vir.
  return (
    <AuthCard>
      <GoogleComplete />
    </AuthCard>
  );
}
