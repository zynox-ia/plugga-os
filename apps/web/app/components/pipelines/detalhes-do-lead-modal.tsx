"use client";

import type { ClientDetail, Deal, Pipeline } from "@plugga/shared";
import { useEffect, useState } from "react";

import {
  documentoFormatado,
  ROTULO_TIPO,
  telefoneFormatado,
} from "../../lib/clientes";
import { formatarBRL, formatarData } from "../../lib/format";
import { diasNaEtapa, estaParado } from "../../lib/negocios";
import { EMPRESAS_POR_ID } from "../../lib/organizacao";
import {
  Button,
  Dialog,
  Heading,
  IconCheck,
  IconCopy,
  IconFileText,
  IconLayers,
  IconUser,
} from "../ui";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

export function DetalhesDoLeadModal({
  negocio,
  pipeline,
  acoes,
  aoFechar,
}: {
  negocio: Deal;
  pipeline: Pipeline;
  acoes: AcoesDoNegocio;
  aoFechar: () => void;
}) {
  const [cliente, setCliente] = useState<ClientDetail | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);

  const etapa = pipeline.stages.find((e) => e.id === negocio.stageId);
  const dias = diasNaEtapa(negocio);
  const parado = estaParado(negocio, pipeline);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/clientes/${negocio.client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: ClientDetail | null) => {
        if (!vivo) return;
        setCliente(dados);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [negocio.client.id]);

  function copiar(texto: string, campo: string) {
    void navigator.clipboard?.writeText(texto);
    setCopiado(campo);
    setTimeout(() => setCopiado(null), 2000);
  }

  const tipo = cliente?.personType ?? negocio.client.personType;
  const docFormatado = documentoFormatado(tipo, cliente?.document ?? null);
  const telFormatado = telefoneFormatado(cliente?.phone ?? null);

  return (
    <Dialog
      title="Detalhes do Lead"
      accessibleLabel="Detalhes do lead"
      description={`Visualização completa dos dados de captação e da negociação de ${negocio.title}.`}
      icon={<IconUser />}
      onClose={aoFechar}
      size="media"
      cancelText="Fechar"
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {negocio.status === "open" ? (
            <Button
              variant="primary"
              icon={<IconCheck width={14} height={14} />}
              onClick={() => {
                aoFechar();
                acoes.ganhar(negocio);
              }}
            >
              {pipeline.wonLabel}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="ui-dialog-form">
        {/* Seção 1: Dados do Lead / Contato */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconUser />}>Dados de Identificação e Contato</Heading>
            <p className="ui-dialog-section-desc">
              Informações do titular captadas no atendimento inicial.
            </p>
          </div>

          <div className="ui-view-grid">
            <div className="ui-view-field">
              <span className="ui-view-label">Nome do Lead / Razão Social</span>
              <span className="ui-view-value">{cliente?.name ?? negocio.client.name}</span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Tipo de Pessoa</span>
              <span className="ui-view-value">{ROTULO_TIPO[tipo]}</span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Telefone / WhatsApp</span>
              <div className="ui-view-value-with-action">
                <span className="ui-view-value">{telFormatado ?? (carregando ? "Carregando…" : "—")}</span>
                {cliente?.phone ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    icon={<IconCopy width={13} height={13} />}
                    aria-label="Copiar telefone"
                    onClick={() => copiar(cliente.phone ?? "", "telefone")}
                  />
                ) : null}
              </div>
              {copiado === "telefone" ? <small style={{ color: "var(--ui-success)", fontSize: "11px" }}>Copiado!</small> : null}
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">E-mail</span>
              <div className="ui-view-value-with-action">
                <span className="ui-view-value">{cliente?.email ?? (carregando ? "Carregando…" : "—")}</span>
                {cliente?.email ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    icon={<IconCopy width={13} height={13} />}
                    aria-label="Copiar e-mail"
                    onClick={() => copiar(cliente.email ?? "", "email")}
                  />
                ) : null}
              </div>
              {copiado === "email" ? <small style={{ color: "var(--ui-success)", fontSize: "11px" }}>Copiado!</small> : null}
            </div>
            {docFormatado ? (
              <div className="ui-view-field">
                <span className="ui-view-label">{tipo === "pj" ? "CNPJ" : "CPF"}</span>
                <span className="ui-view-value">{docFormatado}</span>
              </div>
            ) : null}
            {cliente?.legalName ? (
              <div className="ui-view-field">
                <span className="ui-view-label">Razão Social</span>
                <span className="ui-view-value">{cliente.legalName}</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Seção 2: Negociação e Funil */}
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconLayers />}>Funil Comercial</Heading>
            <p className="ui-dialog-section-desc">
              Posição no pipeline, valores negociados e tempo de permanência.
            </p>
          </div>

          <div className="ui-view-grid">
            <div className="ui-view-field">
              <span className="ui-view-label">Pipeline</span>
              <span className="ui-view-value">
                {pipeline.name} · {EMPRESAS_POR_ID[pipeline.companyId].nome}
              </span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Etapa Atual</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: etapa?.color ?? "#0066cc",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <span className="ui-view-value" style={{ fontWeight: 600 }}>
                  {etapa?.name ?? "Etapa"}
                </span>
              </div>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">{pipeline.valueLabel || "Valor Estimado"}</span>
              <span className="ui-view-value" style={{ color: "var(--ui-primary)", fontWeight: 600, fontSize: "15px" }}>
                {negocio.value ? formatarBRL(negocio.value) : "Sem valor informado"}
              </span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Previsão de Fechamento</span>
              <span className="ui-view-value">
                {negocio.expectedCloseDate ? formatarData(negocio.expectedCloseDate) : "Sem previsão definida"}
              </span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Permanência na Etapa</span>
              <span className="ui-view-value" style={{ color: parado ? "var(--ui-danger)" : "inherit" }}>
                {parado ? `⚠️ Parado há ${dias} dias` : `${dias} ${dias === 1 ? "dia" : "dias"}`}
              </span>
            </div>
            <div className="ui-view-field">
              <span className="ui-view-label">Responsável da Equipe</span>
              <span className="ui-view-value">{negocio.owner.name}</span>
            </div>
          </div>
        </section>

        {/* Seção 3: Etiquetas e Metadados */}
        {negocio.tags.length > 0 ? (
          <section className="ui-dialog-section">
            <div className="ui-dialog-section-header">
              <Heading as="h3" icon={<IconFileText />}>Etiquetas</Heading>
            </div>

            {negocio.tags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {negocio.tags.map((t) => (
                  <span
                    key={t.id}
                    className="ui-dialog-tag"
                    style={{ cursor: "default", borderColor: t.color }}
                  >
                    <span className="ui-dialog-tag-dot" style={{ backgroundColor: t.color }} />
                    <span>{t.name}</span>
                  </span>
                ))}
              </div>
            ) : null}

          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
