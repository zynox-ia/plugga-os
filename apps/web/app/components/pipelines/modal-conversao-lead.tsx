"use client";

import { useState } from "react";

import { Button, Dialog, TextField } from "../ui";

type DadosDeConversao = { nome: string; documento: string; telefone: string; email: string };
type Candidato = { id: string; nome: string };

/** Apresentação preparada para o contrato de conversão; a ação é fornecida por quem abrir o modal. */
export function ModalDeConversao({ dados, candidatos = [], erros = {}, enviando = false, aoConfirmar, aoFechar }: {
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
    { chave: "nome", rotulo: "Nome" }, { chave: "documento", rotulo: "CPF/CNPJ" },
    { chave: "telefone", rotulo: "Telefone" }, { chave: "email", rotulo: "E-mail" },
  ];
  return <Dialog title="Deseja converter para cliente?" description="Confira os dados antes de converter este lead em cliente." onClose={aoFechar} footer={<Button variant="primary" loading={enviando} disabled={candidatos.length > 0 && !destino} onClick={() => aoConfirmar(rascunho, destino === "novo" ? null : destino || null)}>Converter em cliente</Button>} cancelText="Agora não">
    <div className="ui-dialog-form">
      {campos.map((campo) => <TextField key={campo.chave} id={`conversao-${campo.chave}`} label={campo.rotulo} value={rascunho[campo.chave]} error={erros[campo.chave]} onChange={(evento) => setRascunho((atual) => ({ ...atual, [campo.chave]: evento.target.value }))} />)}
      {candidatos.length > 0 ? <fieldset><legend>Escolha como continuar</legend>
        {candidatos.map((candidato) => <label key={candidato.id}><input type="radio" name="destino-conversao" value={candidato.id} checked={destino === candidato.id} onChange={() => setDestino(candidato.id)} /> Vincular a {candidato.nome}</label>)}
        <label><input type="radio" name="destino-conversao" value="novo" checked={destino === "novo"} onChange={() => setDestino("novo")} /> Criar novo cliente</label>
      </fieldset> : null}
    </div>
  </Dialog>;
}
