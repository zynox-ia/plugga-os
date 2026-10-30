"use client";

import type { Deal, Pipeline, PipelinePerson } from "@plugga/shared";
import { useState } from "react";

import { enviar } from "../../lib/clientes";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import { Modal } from "../modal";
import { Icone } from "./icones";

/**
 * Mover o negócio para outro pipeline, escolhendo a etapa. O negócio passa a
 * ser da empresa do destino; as etiquetas, que são do pipeline, ficam para trás.
 */
export function TransferirNegocio({
  pipelines,
  responsaveis,
  origem,
  negocio,
  aoConcluir,
  aoFechar,
}: {
  pipelines: Pipeline[];
  responsaveis: PipelinePerson[];
  origem: Pipeline;
  negocio: Deal;
  aoConcluir: (negocio: Deal) => void;
  aoFechar: () => void;
}) {
  const destinos = pipelines.filter((p) => p.id !== origem.id);
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? "");
  const destino = destinos.find((p) => p.id === destinoId) ?? null;
  const [etapaId, setEtapaId] = useState(destinos[0]?.stages[0]?.id ?? "");
  const [responsavelId, setResponsavelId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const responsavelNoDestino = responsaveis.some((m) => m.id === negocio.owner.id);
  const trocaEmpresa = destino !== null && destino.companyId !== origem.companyId;

  function escolherDestino(id: string) {
    const proximo = destinos.find((p) => p.id === id);
    setDestinoId(id);
    setEtapaId(proximo?.stages[0]?.id ?? "");
    setResponsavelId("");
  }

  async function confirmar() {
    if (!destino) return;
    setEnviando(true);
    setErro(null);
    const corpo = { pipelineId: destino.id, stageId: etapaId, ...(responsavelId ? { ownerId: responsavelId } : {}) };
    const resposta = await enviar<Deal>(`/api/negocios/${negocio.id}/transferencia`, "POST", corpo);
    setEnviando(false);
    if (resposta.ok) aoConcluir(resposta.dados);
    else setErro(resposta.erro.mensagem);
  }

  return (
    <Modal rotulo="Mover para outro pipeline" largura="estreita" aoFechar={aoFechar}>
      <div className="modal-topo">
        <div>
          <h2>Mover para outro pipeline</h2>
          <p className="resumo-encerramento">
            <b>{negocio.title}</b> · {negocio.client.name}
          </p>
        </div>
        <button className="botao-fechar config-botao-fechar" type="button" aria-label="Fechar" onClick={aoFechar}>
          <Icone nome="x" />
        </button>
      </div>
      <div className="modal-corpo">
        {destinos.length === 0 ? (
          <p className="aviso aviso--alerta">Não há outro pipeline ativo que você alcance.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="transferir-pipeline">Pipeline de destino *</label>
              <select id="transferir-pipeline" value={destinoId} onChange={(e) => escolherDestino(e.target.value)}>
                {destinos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {EMPRESAS_POR_ID[p.companyId].nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="transferir-etapa">Etapa *</label>
              <select id="transferir-etapa" value={etapaId} onChange={(e) => setEtapaId(e.target.value)}>
                {destino?.stages.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            {!responsavelNoDestino && responsaveis.length === 0 ? (
              <p className="aviso aviso--alerta">Nenhuma pessoa ativa com acesso ao CRM está disponível.</p>
            ) : !responsavelNoDestino ? (
              <div className="field">
                <label htmlFor="transferir-responsavel">Novo responsável *</label>
                <select id="transferir-responsavel" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                  <option value="">Escolha alguém com acesso ao CRM</option>
                  {responsaveis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <span className="dica">{negocio.owner.name} não está ativo ou não tem mais acesso ao CRM.</span>
              </div>
            ) : null}
            {trocaEmpresa && destino ? (
              <p className="nota-pipeline">
                <Icone nome="info" tamanho={14} />O negócio passa a ser da {EMPRESAS_POR_ID[destino.companyId].nome}. As etiquetas de {origem.name} não vão junto.
              </p>
            ) : null}
          </>
        )}
        {erro ? (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
      <div className="modal-rodape">
        <button className="button button--secondary" type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="button button--accent" type="button" disabled={enviando || !destino || !etapaId || (!responsavelNoDestino && !responsavelId)} onClick={confirmar}>
          <Icone nome="seta" /> {enviando ? "Movendo…" : "Mover negócio"}
        </button>
      </div>
    </Modal>
  );
}
