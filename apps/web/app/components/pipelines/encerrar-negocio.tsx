"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { useState, type ReactNode } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { hojeNoFuso, valorCurto } from "../../lib/negocios";
import { Modal } from "../modal";
import { Icone } from "./icones";

type Props = { pipeline: Pipeline; negocio: Deal; aoConcluir: (negocio: Deal) => void; aoFechar: () => void };

function Topo({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children?: ReactNode }) {
  return (
    <div className="modal-topo">
      <div>
        <h2>{titulo}</h2>
        {children}
      </div>
      <button className="botao-fechar config-botao-fechar" type="button" aria-label="Fechar" onClick={aoFechar}>
        <Icone nome="x" />
      </button>
    </div>
  );
}

function Resumo({ negocio }: { negocio: Deal }) {
  return (
    <p className="resumo-encerramento">
      <b>{negocio.title}</b> · {negocio.client.name}
      {negocio.value ? ` · ${valorCurto(Number(negocio.value))}` : ""}
    </p>
  );
}

/** Ganho encerra o negócio na etapa em que ele está; não tem volta pela tela. */
export function GanhoDoNegocio({ pipeline, negocio, aoConcluir, aoFechar }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    const resposta = await enviar<Deal>(`/api/negocios/${negocio.id}/ganho`, "POST");
    setEnviando(false);
    if (resposta.ok) aoConcluir(resposta.dados);
    else setErro(resposta.erro.mensagem);
  }

  return (
    <Modal rotulo={`Marcar como ${pipeline.wonLabel}`} largura="estreita" aoFechar={aoFechar}>
      <Topo titulo={`Marcar como ${pipeline.wonLabel}`} aoFechar={aoFechar} />
      <div className="modal-corpo">
        <div className="desfecho-confirmacao desfecho-confirmacao--ganho">
          <Icone nome="trofeu" tamanho={22} />
          <Resumo negocio={negocio} />
        </div>
        <p className="dica">O negócio sai do quadro e fica na Lista, com a situação {pipeline.wonLabel}.</p>
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
        <button className="button button--ganho" type="button" disabled={enviando} onClick={confirmar}>
          <Icone nome="check" /> {enviando ? "Salvando…" : `Confirmar ${pipeline.wonLabel}`}
        </button>
      </div>
    </Modal>
  );
}

/** Perdido exige motivo; se o motivo pede, a data para voltar a falar com o cliente. */
export function PerdaDoNegocio({ pipeline, negocio, aoConcluir, aoFechar }: Props) {
  const [motivoId, setMotivoId] = useState<string | null>(null);
  const [revisita, setRevisita] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const motivo = pipeline.lossReasons.find((m) => m.id === motivoId) ?? null;
  const hoje = hojeNoFuso();

  async function confirmar() {
    if (!motivo) return setErro({ mensagem: "Escolha o motivo da perda.", porCampo: { lossReasonId: "obrigatório" } });
    if (motivo.asksRevisitDate && !revisita) return setErro({ mensagem: "Este motivo pede a data para revisitar.", porCampo: { revisitOn: "obrigatório" } });
    setEnviando(true);
    setErro(null);
    const resposta = await enviar<Deal>(`/api/negocios/${negocio.id}/perda`, "POST", { lossReasonId: motivo.id, revisitOn: revisita, note: nota });
    setEnviando(false);
    if (resposta.ok) aoConcluir(resposta.dados);
    else setErro(resposta.erro);
  }

  return (
    <Modal rotulo={`Marcar como ${pipeline.lostLabel}`} largura="estreita" aoFechar={aoFechar}>
      <Topo titulo={`Marcar como ${pipeline.lostLabel}`} aoFechar={aoFechar}>
        <Resumo negocio={negocio} />
      </Topo>
      <div className="modal-corpo">
        {pipeline.lossReasons.length === 0 ? (
          <p className="aviso aviso--alerta">Este pipeline ainda não tem motivos de perda. Peça ao gestor para cadastrá-los em Configurar pipelines.</p>
        ) : (
          <fieldset className="motivos-perda">
            <legend>Motivo da perda *</legend>
            {pipeline.lossReasons.map((m) => (
              <label key={m.id} className={`opcao-motivo${motivoId === m.id ? " opcao-motivo--marcada" : ""}`}>
                <input type="radio" name="motivo-perda" value={m.id} checked={motivoId === m.id} onChange={() => setMotivoId(m.id)} />
                <span>{m.name}</span>
                {m.asksRevisitDate ? <small>pede data</small> : null}
              </label>
            ))}
          </fieldset>
        )}
        {motivo?.asksRevisitDate ? (
          <div className="field">
            <label htmlFor="perda-revisita">Revisitar em *</label>
            <input id="perda-revisita" type="date" min={hoje} value={revisita} aria-invalid={Boolean(erro?.porCampo.revisitOn)} onChange={(e) => setRevisita(e.target.value)} />
            <span className="dica">Nesta data o negócio volta a aparecer para o responsável.</span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="perda-nota">Observação</label>
          <textarea id="perda-nota" rows={2} maxLength={500} value={nota} placeholder="O que aconteceu, em poucas palavras" onChange={(e) => setNota(e.target.value)} />
        </div>
        {erro ? (
          <p className="aviso aviso--erro" role="alert">
            {erro.mensagem}
          </p>
        ) : null}
      </div>
      <div className="modal-rodape">
        <button className="button button--secondary" type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="button button--perigo" type="button" disabled={enviando || pipeline.lossReasons.length === 0} onClick={confirmar}>
          <Icone nome="x" /> {enviando ? "Salvando…" : `Confirmar ${pipeline.lostLabel}`}
        </button>
      </div>
    </Modal>
  );
}
