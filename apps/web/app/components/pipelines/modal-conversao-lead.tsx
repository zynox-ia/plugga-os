"use client";

import { Check, UsersRound, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "../modal";
import { Alert, Button, Dialog, Radio } from "../ui";
import styles from "./modal-conversao-lead.module.css";

export function SucessoDaConversao({ clienteNome, aoFechar }: {
  clienteNome: string | null;
  aoFechar: () => void;
}) {
  return (
    <Modal rotulo="Cliente convertido com sucesso" largura="estreita" className={`ui-dialog ${styles.modalSucesso}`} aoFechar={aoFechar}>
      <div className={styles.sucesso} tabIndex={-1}>
        <Button variant="secondary" size="sm" iconOnly icon={<X />} aria-label="Fechar confirmação"
          className={styles.fecharSucesso} onClick={aoFechar} />
        <span className={styles.destaqueSucesso} aria-hidden="true">
          <span className={styles.marcaSucesso}><Check size={28} strokeWidth={2.5} absoluteStrokeWidth /></span>
        </span>
        <div className={styles.textoSucesso}>
          <h2>{clienteNome ? <bdi>{clienteNome}</bdi> : "Conversão concluída"}</h2>
          <p>Cliente convertido com sucesso.</p>
        </div>
      </div>
    </Modal>
  );
}

export function EscolhaDeClienteNaConversao({ candidatos, enviando, erro, aoEscolher, aoFechar }: {
  candidatos: Array<{ id: string; name: string }>;
  enviando: boolean;
  erro: string | null;
  aoEscolher: (destino: string) => void;
  aoFechar: () => void;
}) {
  const [destino, setDestino] = useState("");
  const escolhaValida = destino === "novo" || candidatos.some((candidato) => candidato.id === destino);

  return (
    <Dialog
      title="Escolha o cliente"
      description="Encontramos cadastros semelhantes. Escolha como concluir a conversão."
      icon={<UsersRound />}
      size="estreita"
      onClose={() => { if (!enviando) aoFechar(); }}
      footer={<Button loading={enviando} disabled={!escolhaValida} onClick={() => aoEscolher(destino)}>Concluir conversão</Button>}
    >
      {erro ? <Alert tone="danger" title="Não foi possível concluir">{erro}</Alert> : null}
      <fieldset className={styles.opcoes} disabled={enviando}>
        <legend className="sr-only">Destino da conversão</legend>
        {candidatos.map((candidato) => (
          <Radio key={candidato.id} className={styles.opcao} name="destino-conversao" value={candidato.id}
            label={`Vincular a ${candidato.name}`} checked={destino === candidato.id} onChange={() => setDestino(candidato.id)} />
        ))}
        <Radio className={styles.opcao} name="destino-conversao" value="novo" label="Criar novo cliente"
          description="Manter este lead em um cadastro separado." checked={destino === "novo"} onChange={() => setDestino("novo")} />
      </fieldset>
    </Dialog>
  );
}
