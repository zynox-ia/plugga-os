import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="Engenharia" voltar={{ href: "/engenharia", rotulo: "Voltar a Engenharia" }} />;
}
