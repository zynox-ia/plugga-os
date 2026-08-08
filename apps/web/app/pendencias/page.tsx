import { redirect } from "next/navigation";

/**
 * A Central de Pendências virou uma seção do Início. A rota permanece como
 * redirecionamento para não quebrar link salvo ou compartilhado por quem já
 * usava a tela.
 */
export default function PendenciasPage() {
  redirect("/");
}
