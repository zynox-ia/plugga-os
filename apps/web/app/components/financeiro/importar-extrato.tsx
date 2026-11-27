"use client";

import type { OpcoesDoFinanceiro } from "@plugga/shared";
import { useState } from "react";

import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { Button, Dialog, FileDropzone, SelectField } from "../ui";

/** "Ler extrato" da Conciliação (PLU-339): a conta e o arquivo OFX; quem chama envia e recarrega. */
export function ImportarExtrato({ contas, contaInicial, ocupado, aoFechar, aoImportar }: {
  contas: OpcoesDoFinanceiro["contasCorrentes"];
  contaInicial?: string;
  ocupado: boolean;
  aoFechar: () => void;
  aoImportar: (contaId: string, arquivo: File) => Promise<void>;
}) {
  const [contaId, setContaId] = useState(contaInicial && contas.some((conta) => conta.id === contaInicial) ? contaInicial : contas[0]?.id ?? "");
  const [arquivo, setArquivo] = useState<File[]>([]);
  return <Dialog title="Importar extrato OFX" description="O arquivo fica no Plugga OS. Movimento repetido não entra de novo." onClose={aoFechar} footer={
    <Button loading={ocupado} disabled={!contaId || !arquivo[0]} onClick={() => { const escolhido = arquivo[0]; if (escolhido) void aoImportar(contaId, escolhido); }}>Importar</Button>
  }>
    <SelectField label="Conta" required value={contaId} onChange={setContaId} options={contas.map((conta) => ({ value: conta.id, label: `${conta.nome} · ${ROTULO_DA_EMPRESA[conta.empresa]}` }))} />
    <FileDropzone label="Arquivo OFX, até 5 MB" value={arquivo} onChange={(itens) => setArquivo(itens.slice(-1))} disabled={ocupado} />
  </Dialog>;
}
