"use client";

import { ARQUIVO_DE_ORDEM_MAX_BYTES, ASSINATURA_MAX_BYTES, type OrdemDeServico } from "@plugga/shared";
import { FileText } from "lucide-react";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import fichaCompras from "../compras/ficha-do-pedido.module.css";
import { TextField } from "../ui";
import { enviarArquivoDaOrdem, type RespostaDaOrdem } from "./envios";
import styles from "./ficha-da-ordem.module.css";

/** O que a ficha chama no botão "Concluir com o termo". */
export type TermoNaTelaRef = { concluir: () => Promise<RespostaDaOrdem | null> };

type Modo = "desenhada" | "nome_digitado";
const TINTA = "#0F294A";

/** O PNG do quadro, para o campo `assinatura` da API. */
function pngDoQuadro(quadro: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolver) => quadro.toBlob(resolver, "image/png"));
}

/**
 * Termo na tela do celular do técnico (E2): nome e documento de quem assina e a
 * assinatura no quadro, com o dedo ou o mouse, ou Enter no quadro para assinar
 * com o nome digitado. O nome acessível do quadro diz se já foi assinado e como.
 */
export const TermoNaTela = forwardRef<TermoNaTelaRef, { ordem: OrdemDeServico; desligado: boolean }>(function TermoNaTela({ ordem, desligado }, ref) {
  const id = useId();
  const quadro = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [modo, setModo] = useState<Modo | null>(null);
  const [erros, setErros] = useState<{ nome?: string; documento?: string; assinatura?: string }>({});

  useEffect(() => {
    const c = quadro.current?.getContext("2d");
    if (!c) return;
    c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = TINTA;
  }, []);

  function limpar() {
    const c = quadro.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setModo(null);
  }

  /** Enter no quadro: escreve o nome digitado como assinatura (sem nome, pede o nome primeiro). */
  function assinarComONome() {
    const c = quadro.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    if (nome.trim().length < 3) { setErros((e) => ({ ...e, nome: "digite o nome de quem assina para assinar com ele.", assinatura: undefined })); return; }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = TINTA; ctx.font = "italic 44px 'Segoe Script', 'Brush Script MT', cursive";
    ctx.fillText(nome.trim(), 32, 96, c.width - 64);
    setModo("nome_digitado"); setErros((e) => ({ ...e, assinatura: undefined }));
  }

  const ponto = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget; const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)] as const;
  };
  function comecar(e: PointerEvent<HTMLCanvasElement>) {
    if (desligado) return;
    const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
    // Quem desenha por cima do nome digitado recomeça a assinatura à mão.
    if (modo === "nome_digitado") ctx.clearRect(0, 0, e.currentTarget.width, e.currentTarget.height);
    desenhando.current = true; e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = ponto(e); ctx.beginPath(); ctx.moveTo(x, y);
  }
  function mover(e: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
    const [x, y] = ponto(e); ctx.lineTo(x, y); ctx.stroke();
    if (modo !== "desenhada") { setModo("desenhada"); setErros((x2) => ({ ...x2, assinatura: undefined })); }
  }
  function teclar(e: KeyboardEvent<HTMLCanvasElement>) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); assinarComONome(); }
  }

  useImperativeHandle(ref, () => ({
    async concluir() {
      const problemas = {
        nome: nome.trim().length >= 3 ? undefined : "informe o nome de quem assina.",
        documento: documento.trim().length >= 5 ? undefined : "informe o documento (CPF ou RG).",
        assinatura: modo ? undefined : "o cliente precisa assinar no quadro.",
      };
      setErros(problemas);
      if (problemas.nome || problemas.documento || problemas.assinatura || !modo) {
        // Leva ao primeiro campo com erro (o quadro pode estar abaixo da dobra da ficha).
        const alvo = problemas.nome ? `${id}-nome` : problemas.documento ? `${id}-documento` : null;
        const elemento = alvo ? document.getElementById(alvo) : quadro.current;
        elemento?.scrollIntoView({ block: "center" }); elemento?.focus({ preventScroll: true });
        return null;
      }
      const form = new FormData();
      form.set("modo", modo); form.set("nome", nome.trim()); form.set("documento", documento.trim());
      if (modo === "desenhada" && quadro.current) {
        const png = await pngDoQuadro(quadro.current);
        if (!png || png.size > ASSINATURA_MAX_BYTES) { setErros({ assinatura: "não foi possível gravar a assinatura. Limpe e assine de novo." }); return null; }
        form.set("assinatura", png, "assinatura.png");
      }
      return enviarArquivoDaOrdem(ordem.id, "/termo", form);
    },
  }), [nome, documento, modo, ordem.id, id]);

  const rotulo = `${id}-rotulo`;
  const nomeAcessivel = modo === "desenhada" ? "Assinatura: assinado à mão pelo cliente" : modo === "nome_digitado" ? `Assinatura: assinado com o nome ${nome.trim()}` : undefined;
  return <div className={styles.termo}>
    <div className={styles.camposDoTermo}>
      <TextField id={`${id}-nome`} label="Nome de quem assina" required maxLength={200} autoComplete="off" placeholder="Responsável no local" value={nome} disabled={desligado}
        onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: undefined })); }} error={erros.nome} />
      <TextField id={`${id}-documento`} label="Documento" required maxLength={30} autoComplete="off" placeholder="CPF ou RG" value={documento} disabled={desligado}
        onChange={(e) => { setDocumento(e.target.value); setErros((x) => ({ ...x, documento: undefined })); }} error={erros.documento} />
    </div>
    <div className="ui-field">
      <span className={styles.rotuloDoQuadro} id={rotulo}>Assinatura do cliente<span className="ui-required"> (obrigatório)</span></span>
      <div className={styles.quadro} data-assinado={modo ? "" : undefined}>
        <canvas ref={quadro} className={styles.tela} width={640} height={150} role="img" tabIndex={desligado ? -1 : 0}
          {...(nomeAcessivel ? { "aria-label": nomeAcessivel } : { "aria-labelledby": rotulo })} aria-describedby={`${id}-dica${erros.assinatura ? ` ${id}-erro` : ""}`}
          aria-invalid={erros.assinatura ? true : undefined}
          onPointerDown={comecar} onPointerMove={mover} onPointerUp={() => { desenhando.current = false; }} onPointerCancel={() => { desenhando.current = false; }} onKeyDown={teclar} />
        <span className={styles.linhaDoQuadro} aria-hidden="true" />
        {modo ? <button type="button" className={`${styles.link} ${styles.limparQuadro}`} onClick={limpar} disabled={desligado}>Limpar</button> : null}
      </div>
      <p className="ui-field-hint" id={`${id}-dica`}>Assine no quadro com o dedo ou o mouse, ou pressione Enter nele para assinar com o nome digitado.</p>
      {erros.assinatura ? <p className="ui-field-error" id={`${id}-erro`}>Erro: {erros.assinatura}</p> : null}
    </div>
  </div>;
});

/** Alternativa ao termo na tela: o PDF assinado à parte, que conclui a O.S. */
export function PdfAssinado({ ordem, desligado, aoEnviar }: { ordem: OrdemDeServico; desligado: boolean; aoEnviar: (r: RespostaDaOrdem | { ok: false; erro: { mensagem: string; porCampo: Record<string, string> } }) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") { aoEnviar({ ok: false, erro: { mensagem: "Envie o termo assinado em PDF.", porCampo: {} } }); return; }
    if (arquivo.size > ARQUIVO_DE_ORDEM_MAX_BYTES) { aoEnviar({ ok: false, erro: { mensagem: "O PDF passa de 25 MB.", porCampo: {} } }); return; }
    const form = new FormData(); form.set("arquivo", arquivo);
    aoEnviar(await enviarArquivoDaOrdem(ordem.id, "/termo/pdf-assinado", form));
  }
  return <p className={fichaCompras.muted}>
    <FileText size={13} aria-hidden="true" /> Sem como assinar na tela?{" "}
    <button type="button" className={styles.link} disabled={desligado} onClick={() => entrada.current?.click()}>Anexar o termo assinado em PDF</button>
    <input ref={entrada} type="file" accept="application/pdf" hidden aria-label="Termo assinado em PDF" onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
  </p>;
}
