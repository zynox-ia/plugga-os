"use client";

import { ARQUIVO_DE_COMPRA_MAX_BYTES, tiposDeArquivoDeCompra, type OpcoesDeCompraResposta, type PedidoDeCompra } from "@plugga/shared";
import { Paperclip, Plus, Store } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { lerErro, type ErroDoFormulario } from "../../lib/clientes";
import { decimalDigitado, numeroDoPedido } from "../../lib/compras";
import { Alert, Button, Dialog, FileDropzone, TextField } from "../ui";
import { CampoDeEscolha } from "./campos-de-compra";

/** Envia um formulário com arquivo (multipart) e devolve o pedido atualizado ou o erro no formato dos formulários. */
export async function enviarComArquivo(caminho: string, formulario: FormData): Promise<{ ok: true; dados: PedidoDeCompra } | { ok: false; erro: ErroDoFormulario }> {
  try {
    const resposta = await fetch(caminho, { method: "POST", body: formulario });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, erro: lerErro(dados, "Não foi possível enviar o arquivo. Tente de novo.") };
    return { ok: true, dados: dados as PedidoDeCompra };
  } catch {
    return { ok: false, erro: { mensagem: "Sem conexão com o servidor. Tente de novo.", porCampo: {} } };
  }
}

/** Confere tipo e tamanho antes do envio; a API confere de novo pelo conteúdo. */
export function problemaDoArquivo(arquivo: File | undefined): string | null {
  if (!arquivo) return null;
  if (!(tiposDeArquivoDeCompra as readonly string[]).includes(arquivo.type)) return "envie PDF, JPG ou PNG.";
  if (arquivo.size > ARQUIVO_DE_COMPRA_MAX_BYTES) return "o arquivo passa de 25 MB.";
  return null;
}

/** Nova cotação do pedido (só em Cotações): fornecedor do cadastro, valores, prazo e o anexo obrigatório. */
export function NovaCotacao({ pedido, opcoes, aoCancelar, aoSalvar }: { pedido: PedidoDeCompra; opcoes: OpcoesDeCompraResposta; aoCancelar: () => void; aoSalvar: (p: PedidoDeCompra) => void }) {
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [frete, setFrete] = useState("");
  const [prazo, setPrazo] = useState("");
  const [condicoes, setCondicoes] = useState("");
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);
  const e = (campo: string) => erro?.porCampo[campo];

  useEffect(() => {
    if (!erro || !focar.current) return;
    focar.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
  }, [erro]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    const v = decimalDigitado(valor);
    const f = frete.trim() ? decimalDigitado(frete) : null;
    const dias = prazo.trim() ? Number(prazo.trim()) : null;
    if (!fornecedor) porCampo.fornecedorId = "escolha o fornecedor do cadastro.";
    if (!v || Number(v) <= 0) porCampo.valor = "informe o valor, como 1.450,00.";
    if (frete.trim() && f === null) porCampo.valorFrete = "informe o frete, como 120,00, ou deixe vazio.";
    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) porCampo.prazoEntregaDias = "dias úteis entre 1 e 365.";
    if (!arquivo[0]) porCampo.arquivo = "anexe a cotação (PDF ou imagem).";
    const problema = problemaDoArquivo(arquivo[0]);
    if (problema) porCampo.arquivo = problema;
    if (Object.keys(porCampo).length) { focar.current = true; setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }

    const form = new FormData();
    form.set("fornecedorId", fornecedor);
    form.set("valor", v!);
    if (f) form.set("valorFrete", f);
    if (dias !== null) form.set("prazoEntregaDias", String(dias));
    if (condicoes.trim()) form.set("condicoesPagamento", condicoes.trim());
    form.set("arquivo", arquivo[0]!);
    setEnviando(true); setErro(null);
    const r = await enviarComArquivo(`/api/suprimentos/compras/pedidos/${pedido.id}/cotacoes`, form);
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    focar.current = true; setErro(r.erro);
  }

  return <Dialog title="Adicionar cotação" description={`${numeroDoPedido(pedido.numero)} · ${pedido.titulo}`} icon={<Paperclip size={20} />} onClose={aoCancelar}
    footer={<Button type="submit" form="form-cotacao" icon={<Plus size={16} />} disabled={enviando}>{enviando ? "Enviando…" : "Registrar cotação"}</Button>}>
    <form ref={formRef} id="form-cotacao" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {erro?.mensagem ? <Alert tone="danger" title={erro.mensagem} /> : null}
      <section className="ui-dialog-section">
        <CampoDeEscolha label="Fornecedor" required valor={fornecedor} aoMudar={setFornecedor} placeholder="Selecione o fornecedor" erro={e("fornecedorId")}
          dica={opcoes.fornecedores.length ? undefined : "Nenhum fornecedor ativo. Cadastre em Suprimentos › Fornecedores."}
          opcoes={opcoes.fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia ?? f.nome, description: f.nomeFantasia ? f.nome : undefined, icon: <Store /> }))} />
        <div className="ui-dialog-grid">
          <TextField label="Valor" required inputMode="decimal" prefix="R$" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="0,00" error={e("valor")} />
          <TextField label="Frete" inputMode="decimal" prefix="R$" value={frete} onChange={(ev) => setFrete(ev.target.value)} placeholder="0,00" hint="Vazio quando o frete é grátis." error={e("valorFrete")} />
          <TextField label="Prazo de entrega (dias úteis)" inputMode="numeric" value={prazo} onChange={(ev) => setPrazo(ev.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Ex.: 5" error={e("prazoEntregaDias")} />
          <TextField label="Condições de pagamento" maxLength={500} value={condicoes} onChange={(ev) => setCondicoes(ev.target.value)} placeholder="Ex.: 30/60 dias no boleto" error={e("condicoesPagamento")} />
        </div>
        <FileDropzone label="Anexo da cotação (obrigatório, PDF ou imagem até 25 MB)" value={arquivo} onChange={(lista) => setArquivo(lista.slice(-1))} disabled={enviando} />
        {e("arquivo") ? <p className="ui-field-error" role="alert">Erro: {e("arquivo")}</p> : null}
      </section>
    </form>
  </Dialog>;
}
