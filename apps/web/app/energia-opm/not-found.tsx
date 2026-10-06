import { NaoEncontradoRota } from "../components/estado-de-rota";

export default function NaoEncontrado() {
  return <NaoEncontradoRota modulo="Energia & OPM" voltar={{ href: "/energia-opm/ciclos", rotulo: "Voltar a Energia & OPM" }} />;
}
