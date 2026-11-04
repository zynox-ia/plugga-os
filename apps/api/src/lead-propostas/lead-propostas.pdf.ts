import path from "node:path";

import { Injectable } from "@nestjs/common";
import type { LeadProposal } from "@plugga/shared";
import PDFDocument from "pdfkit";

const NAVY = "#0F294A";
const BLUE = "#0066CC";
const MUTED = "#64748B";
const LEFT = 46;
const WIDTH = 503.28;

const money = (value: string) => value ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)) : "A definir";
const date = (value: string) => value.split("-").reverse().join("/");

@Injectable()
export class LeadPropostasPdf {
  render(proposal: LeadProposal, draft: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margins: { left: LEFT, right: LEFT, top: 76, bottom: 66 }, bufferPages: true, info: { Title: proposal.content.title, Author: "Plugga" } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      try {
        doc.registerFont("regular", path.join(__dirname, "assets/fonts/GeneralSans-Regular.ttf"));
        doc.registerFont("medium", path.join(__dirname, "assets/fonts/GeneralSans-Medium.ttf"));
        const content = proposal.content;
        const consultiva = proposal.templateStyle === "consultiva";
        if (consultiva) doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);
        const decoration = (cover: boolean) => {
          const y = doc.y;
          doc.save();
          doc.font("medium").fontSize(22).fillColor(cover ? "white" : BLUE).text("plugga", LEFT, 22, { lineBreak: false });
          doc.font("regular").fontSize(8).fillColor(cover ? "#CBD5E1" : MUTED)
            .text(`PC-${String(proposal.number).padStart(4, "0")} · ${draft ? "Rascunho" : `Versão ${proposal.version + 1}`}`, LEFT, 32, { width: WIDTH, align: "right", lineBreak: false });
          doc.moveTo(LEFT, 53).lineTo(LEFT + WIDTH, 53).lineWidth(0.6).strokeColor(cover ? "#34516F" : "#E2E8F0").stroke();
          doc.restore();
          doc.x = LEFT; doc.y = y;
        };

        const text = (value: string, size = 9.5, color = NAVY, font = "regular") => {
          doc.font(font).fontSize(size).fillColor(color).text(value, LEFT, doc.y, { width: WIDTH, lineGap: 3, paragraphGap: 4 });
        };
        const section = (label: string, value: string) => {
          if (!value) return;
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(0.6);
          text(label, 11, NAVY, "medium");
          text(value);
        };
        const coverText = (value: string, initialSize: number, maxHeight: number) => {
          value = value.replace(/\s+/gu, " ");
          let size = initialSize;
          doc.font("medium").fontSize(size);
          while (size > 10 && doc.heightOfString(value, { width: WIDTH, lineGap: 3, paragraphGap: 4 }) > maxHeight) doc.fontSize(--size);
          text(value, size, "white", "medium");
        };
        const identification = () => {
          text("PREPARADA PARA", 8, MUTED);
          text(content.recipient, 12, NAVY, "medium");
          if (content.company && content.company !== content.recipient) text(content.company);
          if (content.jobTitle) text(`Cargo / função: ${content.jobTitle}`, 9, MUTED);
          const contact = [content.email, content.phone, content.city].filter(Boolean).join(" · ");
          if (contact) text(contact, 9, MUTED);
          if (content.owner) { doc.moveDown(0.5); text("RESPONSÁVEL COMERCIAL", 8, MUTED); text(content.owner); }
          doc.moveDown(0.8);
        };
        const investment = () => {
          if (doc.y > doc.page.height - 170) doc.addPage();
          doc.moveDown(1);
          const y = doc.y;
          doc.rect(LEFT, y, WIDTH, 85).fill("#F1F7FE");
          doc.y = y + 12;
          doc.font("regular").fontSize(8).fillColor(MUTED).text("INVESTIMENTO PROPOSTO", LEFT + 14, doc.y);
          doc.font("medium").fontSize(23).fillColor(BLUE).text(money(content.amount), LEFT + 14, y + 28, { width: WIDTH - 28 });
          doc.font("regular").fontSize(9).fillColor(NAVY).text(`Válida até ${date(content.validUntil)}`, LEFT + 14, y + 62);
          doc.x = LEFT; doc.y = y + 100;
        };

        if (consultiva) {
          doc.y = 132;
          text("PROPOSTA COMERCIAL", 10, "#CBD5E1");
          doc.moveDown(0.8);
          coverText(content.title, 27, 250);
          doc.moveDown(1);
          coverText(content.recipient, 14, 100);
          doc.moveDown(1.5);
          text("Uma solução construída para o seu negócio.", 18, "#CBD5E1");
          doc.y = Math.max(doc.y + 30, 640);
          text("INVESTIMENTO PROPOSTO", 8, "#CBD5E1");
          text(money(content.amount), 27, "white", "medium");
          text(`Válida até ${date(content.validUntil)}`, 9, "#CBD5E1");
          doc.addPage();
          text("Detalhamento da proposta", 22, NAVY, "medium");
        } else {
          text("PROPOSTA COMERCIAL", 8, MUTED);
          text(content.title, 22, NAVY, "medium");
        }
        doc.moveDown(0.5);
        identification();
        section("Apresentação", content.introduction);
        section("Escopo e entregáveis", content.scope);
        investment();
        section("Condições comerciais", content.payment);
        section("Observações", content.notes);

        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          decoration(consultiva && i === 0);
          const color = consultiva && i === 0 ? "#CBD5E1" : MUTED;
          const bottom = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;
          doc.font("regular").fontSize(7).fillColor(color).text(draft ? "Rascunho · Proposta em elaboração" : "Plugga · Proposta comercial", LEFT, doc.page.height - 38, { lineBreak: false });
          doc.text(`${i + 1} / ${range.count}`, LEFT, doc.page.height - 38, { width: WIDTH, align: "right", lineBreak: false });
          doc.page.margins.bottom = bottom;
        }
        doc.end();
      } catch (error) { reject(error); doc.end(); }
    });
  }
}
