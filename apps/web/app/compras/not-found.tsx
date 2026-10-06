import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="Compras" voltar={{ href: "/compras", rotulo: "Voltar a Compras" }} />;
}
