import path from "node:path";

import { Injectable } from "@nestjs/common";
import type { OrdemDeServico } from "@plugga/shared";
import PDFDocument from "pdfkit";

const NAVY = "#0F294A";
const MUTED = "#64748B";
const LINHA = "#E2E8F0";
const ESQUERDA = 46;
const LARGURA = 503.28;
const FONTES = path.join(__dirname, "../lead-propostas/assets/fonts");

const TIPO: Record<string, string> = {
  manutencao: "Manutenção", limpeza: "Limpeza", garantia: "Garantia do inversor", emergencia: "Emergência", visita_tecnica: "Visita técnica",
  instalacao: "Instalação", configuracao: "Configuração do inversor", comissionamento: "Comissionamento", orcamento_tecnico: "Orçamento técnico",
  eletroposto: "Eletroposto", grid_zero_bess: "Grid zero e BESS", analise_energia: "Análise de energia", outros: "Outros",
};
const EMPRESA: Record<string, string> = { plugga: "Plugga", waze: "Waze Energia" };

const dataEHora = (instante: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instante);

export type DadosDoTermo = {
  ordem: OrdemDeServico;
  modo: "desenhada" | "nome_digitado";
  nome: string;
  documento: string;
  /** PNG da assinatura desenhada. */
  assinatura: Buffer | null;
  assinadoEm: Date;
};

/**
 * PDF do termo de execução da O.S. (E2), gerado na API a partir da ficha e da
 * assinatura colhida na tela. Leva o documento de quem assina, porque é o
 * próprio termo; o documento nunca sai em log, evento ou histórico.
 */
@Injectable()
export class TermoDaOrdemPdf {
  render({ ordem, modo, nome, documento, assinatura, assinadoEm }: DadosDoTermo): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margins: { left: ESQUERDA, right: ESQUERDA, top: 60, bottom: 60 }, info: { Title: `Termo da ${ordem.codigo}`, Author: EMPRESA[ordem.empresa] ?? "Plugga OS" } });
      const partes: Buffer[] = [];
      doc.on("data", (parte: Buffer) => partes.push(parte));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(partes)));
      try {
        doc.registerFont("regular", path.join(FONTES, "GeneralSans-Regular.ttf"));
        doc.registerFont("medium", path.join(FONTES, "GeneralSans-Medium.ttf"));
        const texto = (valor: string, tamanho = 10, cor = NAVY, fonte = "regular") =>
          doc.font(fonte).fontSize(tamanho).fillColor(cor).text(valor, ESQUERDA, doc.y, { width: LARGURA, lineGap: 3 });
        const campo = (rotulo: string, valor: string | null | undefined) => {
          if (!valor) return;
          texto(rotulo.toUpperCase(), 7.5, MUTED);
          texto(valor);
          doc.moveDown(0.4);
        };
        const secao = (titulo: string) => {
          if (doc.y > doc.page.height - 160) doc.addPage();
          doc.moveDown(0.6);
          texto(titulo, 12, NAVY, "medium");
          doc.moveTo(ESQUERDA, doc.y + 2).lineTo(ESQUERDA + LARGURA, doc.y + 2).lineWidth(0.6).strokeColor(LINHA).stroke();
          doc.moveDown(0.6);
        };

        texto(EMPRESA[ordem.empresa] ?? "", 9, MUTED);
        texto(`Termo de execução de serviço · ${ordem.codigo}`, 18, NAVY, "medium");
        doc.moveDown(0.8);

        secao("Serviço");
        campo("Cliente", ordem.cliente.nome);
        campo("Tipo", TIPO[ordem.tipo] ?? ordem.tipo);
        campo("Local", [ordem.local, ordem.uc ? `UC ${ordem.uc.codigo} (${ordem.uc.distribuidora})` : null].filter(Boolean).join(" · "));
        campo("Técnico", [ordem.tecnico?.nome, ordem.apoio ? `apoio: ${ordem.apoio.nome}` : null].filter(Boolean).join(" · "));
        campo("Chegada ao local", ordem.checkinEm ? dataEHora(new Date(ordem.checkinEm)) : null);
        const equipamento = [ordem.equipamento.equipamento, ordem.equipamento.fabricante, ordem.equipamento.modelo, ordem.equipamento.numeroSerie ? `nº de série ${ordem.equipamento.numeroSerie}` : null].filter(Boolean).join(" · ");
        campo("Equipamento", equipamento);

        if (ordem.laudo) {
          secao("Laudo");
          campo("O que foi encontrado", ordem.laudo.encontrado);
          campo("O que foi feito", ordem.laudo.feito);
          campo("Recomendação", ordem.laudo.recomendacao);
          campo("Fotos", ordem.fotos.length > 0 ? `${ordem.fotos.length} foto(s) guardada(s) na O.S.` : null);
        }

        secao("Aceite");
        texto("Declaro que o serviço descrito acima foi executado e que recebi as informações do laudo.", 10);
        doc.moveDown(1.2);
        if (doc.y > doc.page.height - 170) doc.addPage();
        if (modo === "desenhada" && assinatura) {
          doc.image(assinatura, ESQUERDA, doc.y, { fit: [260, 90] });
          doc.y += 96;
        } else {
          texto(nome, 20, NAVY, "medium");
          texto("Assinado com o nome digitado na tela", 8, MUTED);
        }
        doc.moveTo(ESQUERDA, doc.y + 4).lineTo(ESQUERDA + 300, doc.y + 4).lineWidth(0.6).strokeColor(NAVY).stroke();
        doc.moveDown(0.8);
        campo("Nome", nome);
        campo("Documento", documento);
        campo("Assinado em", dataEHora(assinadoEm));
        doc.end();
      } catch (erro) {
        reject(erro instanceof Error ? erro : new Error(String(erro)));
      }
    });
  }
}
