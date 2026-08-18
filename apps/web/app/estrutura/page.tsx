import { ShellCard, StatusPill } from "../components/plugga-shell";
import {
  EMPRESAS,
  EMPRESAS_POR_ID,
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
 * Mapa Empresa → Departamento → Processo com o estado de construção de cada
 * peça. Existe para responder "o que já dá para usar e o que ainda é desenho?"
 * sem abrir o código — e sai da mesma fonte que monta a navegação, então não
 * tem como divergir dela.
 */
export default function EstruturaPage() {
  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Arquitetura</span>
            <h2>Empresa → Departamento → Processo</h2>
          </div>
        </div>
        <p className="card-note">
          Plugga e Waze são <b>contextos separados</b>, não departamentos. Um cliente, um
          pagamento ou uma obra pertence a uma delas e nunca aparece na outra. O seletor no
          topo troca o contexto inteiro.
        </p>
        <p className="card-note">
          O que atravessa as duas — usuários, jobs, integrações, agentes e o desenho dos
          processos — fica em <b>Plataforma</b>, fora do seletor. Papel de usuário é por
          empresa: a mesma pessoa pode ser financeiro na Plugga e nada na Waze.
        </p>
      </ShellCard>

      {EMPRESAS.map((id) => {
        const empresa = EMPRESAS_POR_ID[id];
        const todos = empresa.departamentos.flatMap((d) => d.processos);
        const { total, prontos, parciais } = contar(todos);

        return (
          <ShellCard className={`panel-card estrutura-empresa estrutura-empresa--${id}`} key={id}>
            <div className="card-heading">
              <div>
                <span className="eyebrow">{empresa.descricao}</span>
                <h2>{empresa.nome}</h2>
              </div>
              <StatusPill variant={prontos > 0 ? "success" : "neutral"}>
                {prontos} prontos · {parciais} parciais · {total} processos
              </StatusPill>
            </div>

            <div className="estrutura-grid">
              {empresa.departamentos.map((departamento) => (
                <div className="estrutura-departamento" key={departamento.id}>
                  <h3>{departamento.label}</h3>
                  <ListaProcessos processos={departamento.processos} />
                </div>
              ))}
            </div>
          </ShellCard>
        );
      })}

      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Fora do seletor</span>
            <h2>Plataforma · as duas empresas</h2>
          </div>
        </div>
        <div className="estrutura-grid">
          <div className="estrutura-departamento">
            <h3>Visão geral · por empresa</h3>
            <ListaProcessos processos={VISAO_GERAL} />
          </div>
          <div className="estrutura-departamento">
            <h3>Global · sem empresa</h3>
            <ListaProcessos processos={GLOBAIS} />
          </div>
        </div>
      </ShellCard>
    </>
  );
}
