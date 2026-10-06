import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="Clientes" voltar={{ href: "/clientes", rotulo: "Voltar a Clientes" }} />;
}
