import { ShellCard, StatusPill } from "../components/plugga-shell";
import {
  DEPARTAMENTOS,
  GLOBAIS,
  VISAO_GERAL,
  type Processo,
  type ProcessoStatus,
} from "../lib/organizacao";

export const metadata = { title: "Estrutura · plugga-os" };

const STATUS: Record<ProcessoStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
  pronto: { label: "pronto", variant: "success" },
  parcial: { label: "parcial", variant: "warning" },
  "em-breve": { label: "em breve", variant: "neutral" },
};

function contar(processos: Processo[]) {
  return {
    total: processos.length,
    prontos: processos.filter((p) => p.status === "pronto").length,
    parciais: processos.filter((p) => p.status === "parcial").length,
  };
}

function ListaProcessos({ processos }: { processos: Processo[] }) {
  return (
    <ul className="estrutura-lista">
      {processos.map((processo) => (
        <li key={processo.label}>
          <span>{processo.label}</span>
          <StatusPill variant={STATUS[processo.status].variant}>
            {STATUS[processo.status].label}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

/**
 * Mapa Departamento → Processo com o estado de construção de cada peça. Existe
 * para responder "o que já dá para usar e o que ainda é desenho?" sem abrir o
 * código — e sai da mesma fonte que monta a navegação, então não tem como
 * divergir dela.
 */
export default function EstruturaPage() {
  const { total, prontos, parciais } = contar(DEPARTAMENTOS.flatMap((departamento) => departamento.processos));

  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Arquitetura</span>
            <h2>Departamento → Processo</h2>
          </div>
          <StatusPill variant={prontos > 0 ? "success" : "neutral"}>
            {prontos} prontos · {parciais} parciais · {total} processos
          </StatusPill>
        </div>
        <p className="card-note">
          Os departamentos são os mesmos da barra lateral e do acesso: cada pessoa é membro ou
          gerente dos seus. Plugga e Waze não são departamentos — são a etiqueta de cada registro.
        </p>
        <div className="estrutura-grid">
          {DEPARTAMENTOS.map((departamento) => (
            <div className="estrutura-departamento" key={departamento.id}>
              <h3>{departamento.label}</h3>
              <ListaProcessos processos={departamento.processos} />
            </div>
          ))}
        </div>
      </ShellCard>

      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Áreas compartilhadas</span>
            <h2>Plataforma</h2>
          </div>
        </div>
        <div className="estrutura-grid">
          <div className="estrutura-departamento">
            <h3>Visão geral</h3>
            <ListaProcessos processos={VISAO_GERAL} />
          </div>
          <div className="estrutura-departamento">
            <h3>Global</h3>
            <ListaProcessos processos={GLOBAIS} />
          </div>
        </div>
      </ShellCard>
    </>
  );
}
