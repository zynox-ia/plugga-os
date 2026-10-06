import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="PluggaMob" voltar={{ href: "/pluggamob", rotulo: "Voltar a PluggaMob" }} />;
}
