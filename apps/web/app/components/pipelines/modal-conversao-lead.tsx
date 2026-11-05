"use client";

import type { Deal } from "@plugga/shared";
import { useState } from "react";

import { converterLead, dadosDeConversao, erroCampoConversao, type DadosDeConversao } from "../../lib/conversao-lead";
import { Button, Dialog, TextField } from "../ui";

type Candidato = { id: string; nome: string };

/** Apresentação preparada para o contrato de conversão; a ação é fornecida por quem abrir o modal. */
export function ModalDeConversao({
  dados,
  candidatos = [],
  erros = {},
  enviando = false,
  aoConfirmar,
  aoFechar,
}: {
  dados: DadosDeConversao;
  candidatos?: Candidato[];
  erros?: Partial<Record<keyof DadosDeConversao, string>>;
  enviando?: boolean;
  aoConfirmar: (dados: DadosDeConversao, clienteId: string | null) => void;
  aoFechar: () => void;
}) {
  const [rascunho, setRascunho] = useState(dados);
  const [destino, setDestino] = useState("");
  const campos: { chave: keyof DadosDeConversao; rotulo: string }[] = [
    { chave: "nome", rotulo: "Nome" },
    { chave: "documento", rotulo: "CPF/CNPJ" },
    { chave: "telefone", rotulo: "Telefone" },
    { chave: "email", rotulo: "E-mail" },
  ];
  return (
    <Dialog
      title="Deseja converter para cliente?"
      description="Confira os dados antes de converter este lead em cliente."
      onClose={aoFechar}
      footer={
        <Button
          variant="primary"
          loading={enviando}
          disabled={candidatos.length > 0 && !destino}
          onClick={() => aoConfirmar(rascunho, destino === "novo" ? null : destino || null)}
        >
          Converter em cliente
        </Button>
      }
      cancelText="Agora não"
    >
      <div className="ui-dialog-form">
        {campos.map((campo) => (
          <TextField
            key={campo.chave}
            id={`conversao-${campo.chave}`}
            label={campo.rotulo}
            value={rascunho[campo.chave]}
            error={erros[campo.chave]}
            onChange={(evento) => setRascunho((atual) => ({ ...atual, [campo.chave]: evento.target.value }))}
          />
        ))}
        {candidatos.length > 0 ? (
          <fieldset>
            <legend>Escolha como continuar</legend>
            {candidatos.map((candidato) => (
              <label key={candidato.id}>
                <input
                  type="radio"
                  name="destino-conversao"
                  value={candidato.id}
                  checked={destino === candidato.id}
                  onChange={() => setDestino(candidato.id)}
                />{" "}
                Vincular a {candidato.nome}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="destino-conversao"
                value="novo"
                checked={destino === "novo"}
                onChange={() => setDestino("novo")}
              />{" "}
              Criar novo cliente
            </label>
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Modal conectado ao endpoint POST /leads/:id/converter (PLU-271) */
export function ModalDeConversaoDoLead({
  negocio,
  aoConcluir,
  aoFechar,
}: {
  negocio: Deal;
  aoConcluir: (negocio: Deal) => void;
  aoFechar: () => void;
}) {
  const [perfilSalvo, setPerfilSalvo] = useState(negocio);
  const [rascunho, setRascunho] = useState(() => dadosDeConversao(negocio.lead));
  const [destino, setDestino] = useState<string>("");
  const [candidatos, setCandidatos] = useState<{ id: string; nome: string }[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  async function converter() {
    setEnviando(true);
    setErroGeral(null);
    setErros({});

    const resp = await converterLead(perfilSalvo, rascunho, destino, (atualizado) => {
      setPerfilSalvo(atualizado);
      setRascunho(dadosDeConversao(atualizado.lead));
      aoConcluir(atualizado);
    });

    setEnviando(false);
    if (resp.ok) {
      aoConcluir(resp.dados.lead);
      aoFechar();
    } else {
      setErroGeral(resp.erro.mensagem);
      if (resp.erro.candidatos && resp.erro.candidatos.length > 0) {
        setCandidatos(resp.erro.candidatos.map((c) => ({ id: c.id, nome: c.name })));
      }
      setErros(resp.erro.porCampo);
    }
  }

  return (
    <Dialog
      title="Converter lead em cliente"
      description="Confira os dados antes de gerar ou vincular a ficha definitiva de cliente."
      onClose={aoFechar}
      footer={
        <Button
          variant="primary"
          loading={enviando}
          disabled={candidatos.length > 0 && !destino}
          onClick={converter}
        >
          Converter em cliente
        </Button>
      }
      cancelText="Cancelar"
    >
      <div className="ui-dialog-form">
        {erroGeral ? (
          <p className="aviso aviso--erro" role="alert">
            {erroGeral}
          </p>
        ) : null}
        <TextField
          id="conversao-nome"
          label="Nome"
          disabled={enviando}
          value={rascunho.nome}
          error={erroCampoConversao(erros, "name")}
          onChange={(e) => setRascunho((a) => ({ ...a, nome: e.target.value }))}
        />
        <TextField
          id="conversao-documento"
          label="CPF ou CNPJ"
          disabled={enviando}
          value={rascunho.documento}
          error={erroCampoConversao(erros, "document")}
          onChange={(e) => setRascunho((a) => ({ ...a, documento: e.target.value }))}
        />
        <TextField
          id="conversao-telefone"
          label="Telefone"
          disabled={enviando}
          value={rascunho.telefone}
          error={erroCampoConversao(erros, "phone")}
          onChange={(e) => setRascunho((a) => ({ ...a, telefone: e.target.value }))}
        />
        <TextField
          id="conversao-email"
          label="E-mail"
          disabled={enviando}
          value={rascunho.email}
          error={erroCampoConversao(erros, "email")}
          onChange={(e) => setRascunho((a) => ({ ...a, email: e.target.value }))}
        />

        {candidatos.length > 0 ? (
          <fieldset style={{ marginTop: "12px", border: "1px solid var(--ui-divider)", borderRadius: "6px", padding: "12px" }}>
            <legend style={{ padding: "0 6px", fontSize: "12px", fontWeight: 500 }}>Possíveis duplicatas encontradas:</legend>
            {candidatos.map((candidato) => (
              <label key={candidato.id} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="destino-conversao"
                  value={candidato.id}
                  disabled={enviando}
                  checked={destino === candidato.id}
                  onChange={() => setDestino(candidato.id)}
                />
                <span>Vincular a <strong>{candidato.nome}</strong></span>
              </label>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0", cursor: "pointer" }}>
              <input
                type="radio"
                name="destino-conversao"
                value="novo"
                disabled={enviando}
                checked={destino === "novo"}
                onChange={() => setDestino("novo")}
              />
              <span>Criar um novo cadastro de cliente mesmo assim</span>
            </label>
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}
