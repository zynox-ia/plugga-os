"use client";

import type { LeadSolarProject } from "@plugga/shared";
import { Eye, Pencil, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { formatarBRL, formatarData, formatarNumero } from "../../lib/format";
import { ROTULO_INSTALACAO_SOLAR, ROTULO_TELHADO_SOLAR, tituloDoProjetoSolar } from "../../lib/projetos-solares-lead";
import { Button, Dialog, Heading } from "../ui";
import styles from "./projetos-do-lead.module.css";

export function VisualizarProjetoSolarModal({
  projeto,
  aoEditar,
  aoFechar,
}: {
  projeto: LeadSolarProject;
  aoEditar: () => void;
  aoFechar: () => void;
}) {
  const modal = (
    <Dialog
      title="Detalhes do projeto"
      description={tituloDoProjetoSolar(projeto)}
      icon={<Eye />}
      size="media"
      cancelText="Fechar"
      onClose={aoFechar}
      footer={<Button variant="primary" icon={<Pencil />} onClick={aoEditar}>Editar projeto</Button>}
    >
      <div className="ui-dialog-form">
        <section className="ui-dialog-section" aria-labelledby="secao-visualizar-projeto">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-visualizar-projeto" icon={<Sun />}>Dados do projeto</Heading>
            <p className="ui-dialog-section-desc">
              Atualizado em {formatarData(projeto.updatedAt)} · criado em {formatarData(projeto.createdAt)}.
            </p>
          </div>
          <dl className={styles.detalhes}>
            <div><dt>Tipo de instalação</dt><dd>{ROTULO_INSTALACAO_SOLAR[projeto.installationType]}</dd></div>
            <div><dt>Consumo médio</dt><dd>{formatarNumero(projeto.averageConsumptionKwh)} kWh</dd></div>
            <div><dt>Unidade consumidora</dt><dd>{projeto.consumerUnit}</dd></div>
            <div><dt>Tipo de telhado</dt><dd>{projeto.roofType ? ROTULO_TELHADO_SOLAR[projeto.roofType] : "A definir"}</dd></div>
            <div><dt>Área disponível</dt><dd>{projeto.availableAreaM2 ? `${formatarNumero(projeto.availableAreaM2)} m²` : "A definir"}</dd></div>
            <div><dt>Potência estimada</dt><dd>{projeto.estimatedPowerKwp ? `${formatarNumero(projeto.estimatedPowerKwp)} kWp` : "A definir"}</dd></div>
            <div className={styles.detalheInteiro}><dt>Investimento estimado</dt><dd>{projeto.estimatedInvestment ? formatarBRL(projeto.estimatedInvestment) : "A definir"}</dd></div>
            <div className={styles.detalheInteiro}><dt>UCs beneficiárias</dt><dd>{projeto.beneficiaryUcs.length ? projeto.beneficiaryUcs.map((uc) => uc.code).join(", ") : "Nenhuma"}</dd></div>
            <div className={styles.detalheInteiro}>
              <dt>Contas de energia</dt>
              <dd>{projeto.energyBillDocumentIds.length
                ? `${projeto.energyBillDocumentIds.length} conta${projeto.energyBillDocumentIds.length === 1 ? "" : "s"} na aba Documentos`
                : "Nenhuma conta anexada"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </Dialog>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
