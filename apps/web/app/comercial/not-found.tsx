import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="Comercial" voltar={{ href: "/comercial/oportunidades", rotulo: "Voltar a Comercial" }} />;
}
