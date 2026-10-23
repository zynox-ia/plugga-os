"use client";

import type { ClientOwner, CreateClientResponse, ListClientsResponse } from "@plugga/shared";
import { useEffect, useId, useState } from "react";

import { enviar } from "../../lib/clientes";
import { ClienteForm } from "../cliente-form";
import { Modal } from "../modal";
import { Icone } from "./icones";

export type ClienteEscolhido = { id: string; name: string; detalhe: string | null };

/**
 * Escolha do cliente do negócio: busca por nome, documento ou contato enquanto
 * se digita, e cadastro de cliente novo sem fechar o negócio.
 */
export function BuscaDeCliente({
  cliente,
  aoEscolher,
  responsaveis,
  erro,
}: {
  cliente: ClienteEscolhido | null;
  aoEscolher: (cliente: ClienteEscolhido | null) => void;
  responsaveis: ClientOwner[];
  erro?: string;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ListClientsResponse["items"] | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const lista = useId();

  useEffect(() => {
    const busca = termo.trim();
    if (busca.length < 2) return setResultados(null);
    let vivo = true;
    const espera = setTimeout(() => {
      void enviar<ListClientsResponse>(`/api/clientes?${new URLSearchParams({ q: busca, active: "true" }).toString()}`, "GET").then((resposta) => {
        if (vivo) setResultados(resposta.ok ? resposta.dados.items.slice(0, 8) : []);
      });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [termo]);

  if (cliente) {
    return (
      <div className="cliente-escolhido">
        <span className="cliente-escolhido-icone" aria-hidden="true">
          <Icone nome="equipe" tamanho={16} />
        </span>
        <span className="cliente-escolhido-texto">
          <b>{cliente.name}</b>
          {cliente.detalhe ? <small>{cliente.detalhe}</small> : null}
        </span>
        <button type="button" className="link-botao" onClick={() => aoEscolher(null)}>
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="busca-cliente">
      <div className="busca-cliente-campo">
        <Icone nome="busca" tamanho={15} />
        <input
          id="negocio-cliente"
          type="search"
          role="combobox"
          aria-expanded={resultados !== null}
          aria-controls={lista}
          aria-invalid={Boolean(erro)}
          autoComplete="off"
          placeholder="Buscar por nome, CNPJ/CPF ou contato"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </div>
      {resultados !== null ? (
        <ul className="busca-cliente-resultados" id={lista} role="listbox" aria-label="Clientes encontrados">
          {resultados.length === 0 ? <li className="busca-cliente-nada">Nenhum cliente ativo encontrado.</li> : null}
          {resultados.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => aoEscolher({ id: c.id, name: c.name, detalhe: c.documentDisplay ?? c.primaryContactName ?? null })}>
                <b>{c.name}</b>
                <small>{[c.documentDisplay, c.primaryContactName, c.city].filter(Boolean).join(" · ") || "Sem documento"}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="dica">
        Não encontrou?{" "}
        <button type="button" className="link-botao" onClick={() => setCadastrando(true)}>
          + Novo cliente
        </button>{" "}
        sem fechar esta janela.
      </p>
      {erro ? <span className="erro-campo">{erro}</span> : null}

      {cadastrando ? (
        <Modal rotulo="Novo cliente" aoFechar={() => setCadastrando(false)}>
          <div className="modal-topo">
            <h2>Novo cliente</h2>
            <button className="botao-fechar config-botao-fechar" type="button" aria-label="Fechar" onClick={() => setCadastrando(false)}>
              <Icone nome="x" />
            </button>
          </div>
          <ClienteForm
            modo="criar"
            responsaveis={responsaveis}
            aoCancelar={() => setCadastrando(false)}
            aoCriar={(resposta: CreateClientResponse) => {
              setCadastrando(false);
              aoEscolher({ id: resposta.client.id, name: resposta.client.name, detalhe: null });
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
