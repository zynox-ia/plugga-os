"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { ArrowLeft, ArrowRight, LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./button";
import styles from "./pdf-preview.module.css";

export function PdfPreview({ url, nome }: { url: string; nome: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [largura, setLargura] = useState(0);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elemento = container.current;
    if (!elemento) return;
    const observer = new ResizeObserver(() => setLargura(elemento.clientWidth));
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let tarefa: PDFDocumentLoadingTask | undefined;
    setPdf(null); setPagina(1); setErro("");
    void (async () => {
      try {
        const biblioteca = await import("pdfjs-dist");
        if (controller.signal.aborted) return;
        biblioteca.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const resposta = await fetch(url, { signal: controller.signal });
        if (!resposta.ok) throw new Error("Não foi possível abrir o documento.");
        const bytes = await resposta.arrayBuffer();
        if (controller.signal.aborted) return;
        const carregamento = biblioteca.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
        tarefa = carregamento;
        const documento = await carregamento.promise;
        if (!controller.signal.aborted) setPdf(documento);
      } catch { if (!controller.signal.aborted) setErro("Não foi possível visualizar este PDF. Tente novamente ou baixe o documento."); }
    })();
    return () => { controller.abort(); void tarefa?.destroy(); };
  }, [url, tentativa]);
  useEffect(() => {
    if (!pdf || !canvas.current || !largura) return;
    let cancelado = false; let render: RenderTask | undefined;
    void pdf.getPage(pagina).then((folha) => {
      if (cancelado || !canvas.current) return;
      const base = folha.getViewport({ scale: 1 });
      const viewport = folha.getViewport({ scale: Math.min(1.3, Math.max(.25, (largura - 40) / base.width)) * zoom });
      const retina = window.devicePixelRatio || 1;
      const elemento = canvas.current;
      elemento.width = viewport.width * retina; elemento.height = viewport.height * retina;
      elemento.style.width = `${viewport.width}px`; elemento.style.height = `${viewport.height}px`;
      const contexto = elemento.getContext("2d");
      if (!contexto) return;
      render = folha.render({ canvasContext: contexto, viewport, transform: retina === 1 ? undefined : [retina, 0, 0, retina, 0, 0] });
      return render.promise;
    }).catch((falha: Error) => { if (!cancelado && falha.name !== "RenderingCancelledException") setErro("Não foi possível exibir esta página."); });
    return () => { cancelado = true; render?.cancel(); };
  }, [pdf, pagina, zoom, largura]);
  return <div>
    <div className={styles.barraPdf}><div><Button variant="secondary" size="sm" icon={<ArrowLeft />} iconOnly aria-label="Página anterior" disabled={!pdf || pagina === 1} onClick={() => setPagina((atual) => atual - 1)} /><span aria-live="polite">{pdf ? `${pagina} / ${pdf.numPages}` : "Abrindo documento…"}</span><Button variant="secondary" size="sm" icon={<ArrowRight />} iconOnly aria-label="Próxima página" disabled={!pdf || pagina === pdf.numPages} onClick={() => setPagina((atual) => atual + 1)} /></div><div><Button variant="secondary" size="sm" icon={<ZoomOut />} iconOnly aria-label="Diminuir documento" disabled={zoom <= .6} onClick={() => setZoom((atual) => atual - .2)} /><Button variant="secondary" size="sm" icon={<ZoomIn />} iconOnly aria-label="Ampliar documento" disabled={zoom >= 1.8} onClick={() => setZoom((atual) => atual + .2)} /></div></div>
    <div ref={container} className={styles.paginaPdf}>{erro ? <div role="alert"><p>{erro}</p><Button variant="secondary" size="sm" onClick={() => setTentativa((atual) => atual + 1)}>Tentar novamente</Button></div> : <>{!pdf ? <LoaderCircle className={styles.carregando} aria-label="Abrindo documento" /> : null}<canvas ref={canvas} aria-label={`${nome}, página ${pagina}`} /></>}</div>
  </div>;
}
