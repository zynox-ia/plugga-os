"use client";

import { alcancaTela, type ClientOwner, type CreateClientResponse, type ClientSelectionResponse } from "@plugga/shared";
import { useEffect, useId, useState } from "react";

import { enviar } from "../../lib/clientes";
import { useSessionUser } from "../../lib/use-session-user";
import { ClienteForm } from "../cliente-form";
import { Modal } from "../modal";
import { Button, IconSearch, IconUser, IconX } from "../ui";

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
  const [resultados, setResultados] = useState<ClientSelectionResponse["items"] | null>(null);
  const { usuario } = useSessionUser();
  const [cadastrando, setCadastrando] = useState(false);
  const lista = useId();

  useEffect(() => {
    const busca = termo.trim();
    if (busca.length < 2) return setResultados(null);
    let vivo = true;
    const espera = setTimeout(() => {
      void enviar<ClientSelectionResponse>(`/api/negocios/clientes?${new URLSearchParams({ q: busca }).toString()}`, "GET").then((resposta) => {
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
          <IconUser width={16} height={16} />
        </span>
        <div className="cliente-escolhido-texto">
          <b>{cliente.name}</b>
          {cliente.detalhe ? <small>{cliente.detalhe}</small> : null}
        </div>
        <Button variant="secondary" size="sm" type="button" onClick={() => aoEscolher(null)}>
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <div className="busca-cliente">
      <div className={`ui-input-wrap ${erro ? "ui-input-invalid" : ""}`}>
        <span className="ui-input-leading" aria-hidden="true">
          <IconSearch width={16} height={16} />
        </span>
        <input
          id="negocio-cliente"
          type="search"
          role="combobox"
          className="ui-input"
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
      <p className="ui-field-hint" style={{ marginTop: 4 }}>
        Não encontrou?{" "}
        <button type="button" className="link-botao" disabled={!alcancaTela(usuario?.acesso, "crm.clientes")} onClick={() => setCadastrando(true)}>
          + Novo cliente
        </button>{" "}
        sem fechar esta janela.
      </p>
      {erro ? <p className="ui-field-error" style={{ margin: 0 }}>Erro: {erro}</p> : null}

      {cadastrando ? (
        <Modal rotulo="Novo cliente" aoFechar={() => setCadastrando(false)} largura="media" className="ui-dialog">
          <header className="ui-dialog-header">
            <div className="ui-dialog-header-content">
              <div className="ui-dialog-header-icon" aria-hidden="true">
                <IconUser width={20} height={20} />
              </div>
              <div className="ui-dialog-header-text">
                <h2 className="ui-dialog-title">Novo cliente</h2>
                <p className="ui-dialog-subtitle">Cadastre um novo cliente no CRM sem fechar este negócio.</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconX />}
              iconOnly
              aria-label="Fechar"
              onClick={() => setCadastrando(false)}
            />
          </header>
          <div className="ui-dialog-body">
            <ClienteForm
              modo="criar"
              responsaveis={responsaveis}
              aoCancelar={() => setCadastrando(false)}
              aoCriar={(resposta: CreateClientResponse) => {
                setCadastrando(false);
                aoEscolher({ id: resposta.client.id, name: resposta.client.name, detalhe: null });
              }}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
