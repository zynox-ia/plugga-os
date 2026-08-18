"use client";

import { useState } from "react";
import { ShellCard, StatusPill, ShellTable } from "../components/plugga-shell";

type ColorToken = {
  name: string;
  role: string;
  hex: string;
  rgb: string;
  cmyk: string;
  usage: string;
  bgStyle: string;
  textColor: string;
};

const COLOR_TOKENS: ColorToken[] = [
  {
    name: "Verde Petróleo",
    role: "Cor Primária (Fundos & Textos)",
    hex: "#003333",
    rgb: "RGB 0 51 51",
    cmyk: "CMYK 93 51 60 65",
    usage: "Uso para fundos e textos. Profundidade e confiança.",
    bgStyle: "#003333",
    textColor: "#E0DBC7",
  },
  {
    name: "Areia",
    role: "Cor Neutra Suave (Fundos & Textos)",
    hex: "#E0DBC7",
    rgb: "RGB 224 219 199",
    cmyk: "CMYK 15 11 24 0",
    usage: "Uso para fundos e textos. Solidez e equilíbrio.",
    bgStyle: "#E0DBC7",
    textColor: "#003333",
  },
  {
    name: "Laranja Intenso",
    role: "Destaque & Ação (Fundos Apenas)",
    hex: "#F25601",
    rgb: "RGB 242 86 1",
    cmyk: "CMYK 0 76 99 0",
    usage: "Uso apenas para fundos. Energia e movimento.",
    bgStyle: "#F25601",
    textColor: "#FFFFFF",
  },
  {
    name: "Verde Folha",
    role: "Sucesso & Atividade (Fundos Apenas)",
    hex: "#00AF88",
    rgb: "RGB 0 175 136",
    cmyk: "CMYK 76 0 58 0",
    usage: "Uso apenas para fundos. Renovação e vitalidade.",
    bgStyle: "#00AF88",
    textColor: "#FFFFFF",
  },
  {
    name: "Bege Amadeirado",
    role: "Suporte Quente (Fundos Apenas)",
    hex: "#D6B896",
    rgb: "RGB 214 184 150",
    cmyk: "CMYK 16 27 43 4",
    usage: "Uso apenas para fundos. Sustentação e proximidade.",
    bgStyle: "#D6B896",
    textColor: "#003333",
  },
];

const SPACING_TOKENS = [
  { name: "--space-2xs", size: "4px", label: "Micro Gap / Compact Padding" },
  { name: "--space-xs", size: "8px", label: "Group Gap / Small Padding" },
  { name: "--space-sm", size: "12px", label: "Standard Card Inner Gap" },
  { name: "--space-md", size: "16px", label: "Default Container Padding" },
  { name: "--space-lg", size: "24px", label: "Section Gap / Card Padding" },
  { name: "--space-xl", size: "32px", label: "Header & Main Section Gap" },
  { name: "--space-2xl", size: "48px", label: "Page Layout Margin" },
];

const RADIUS_TOKENS = [
  { name: "--radius-xs", size: "4px", label: "Badges & Tooltips" },
  { name: "--radius-sm", size: "8px", label: "Form Inputs & Micro Buttons" },
  { name: "--radius-md", size: "12px", label: "Inner Panels & Modals" },
  { name: "--radius-lg", size: "18px", label: "Standard Shell Cards" },
  { name: "--radius-xl", size: "24px", label: "Sidebar & Large Containers" },
  { name: "--radius-full", size: "9999px", label: "Pills & Action Buttons" },
];

export default function DesignSystemPage() {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"colors" | "typography" | "components" | "layout">("colors");
  const [inputVal, setInputVal] = useState("Exemplo de busca no sistema");
  const [toggleActive, setToggleActive] = useState(true);
  const [selectedRadio, setSelectedRadio] = useState("opt1");

  const copyToClipboard = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Page Header */}
      <header className="page-header">
        <div>
          <span className="eyebrow">PLUGGA © 2025 · BRANDBOOK & UI SYSTEM</span>
          <h1>Design System & Guia de Estilo</h1>
          <p>
            Alinhamento completo de cores, espaçamentos, tipografia, border-radius, botões, estados de hover e componentes da interface.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className={`button ${activeTab === "colors" ? "button--primary" : "button--ghost"}`}
            onClick={() => setActiveTab("colors")}
          >
            Paleta de Cores
          </button>
          <button
            type="button"
            className={`button ${activeTab === "components" ? "button--primary" : "button--ghost"}`}
            onClick={() => setActiveTab("components")}
          >
            Componentes & Botões
          </button>
          <button
            type="button"
            className={`button ${activeTab === "layout" ? "button--primary" : "button--ghost"}`}
            onClick={() => setActiveTab("layout")}
          >
            Espaçamentos & Radius
          </button>
          <button
            type="button"
            className={`button ${activeTab === "typography" ? "button--primary" : "button--ghost"}`}
            onClick={() => setActiveTab("typography")}
          >
            Tipografia
          </button>
        </div>
      </header>

      {/* Brandbook Highlight Banner */}
      <ShellCard style={{ background: "#003333", border: "1px solid rgba(0, 51, 51, 0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #F25601 0%, #00AF88 100%)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                color: "#fff",
                fontSize: "18px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.3)"
              }}
            >
              DS
            </div>
            <div>
              <h3 style={{ margin: 0, color: "#E0DBC7", fontSize: "18px" }}>Identidade Visual Oficial Plugga OS (Tema Areia)</h3>
              <p style={{ margin: "4px 0 0", color: "rgba(224, 219, 199, 0.85)", fontSize: "13.5px" }}>
                Fundo da aplicação atualizado para a tonalidade <strong>Areia (#E0DBC7)</strong>, com contraste primário em <strong>Verde Petróleo (#003333)</strong>, <strong>Laranja Intenso (#F25601)</strong>, <strong>Verde Folha (#00AF88)</strong> e <strong>Bege Amadeirado (#D6B896)</strong>.
              </p>
            </div>
          </div>
          {copiedHex && (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                background: "rgba(0, 175, 136, 0.2)",
                border: "1px solid #00AF88",
                color: "#E0DBC7",
                fontSize: "12.5px",
                fontWeight: 500
              }}
            >
              ✓ Código {copiedHex} copiado para a área de transferência!
            </div>
          )}
        </div>
      </ShellCard>

      {/* SECTION 1: COLOR PALETTE */}
      {(activeTab === "colors" || activeTab === "components") && (
        <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2>1. Paleta de Cores Oficial (Brandbook)</h2>
            <span className="status-pill status-pill--success">5 Cores Primárias</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            {COLOR_TOKENS.map((token) => (
              <div
                key={token.hex}
                style={{
                  borderRadius: "18px",
                  overflow: "hidden",
                  border: "1px solid rgba(224, 219, 199, 0.15)",
                  background: "rgba(0, 51, 51, 0.5)",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  cursor: "pointer"
                }}
                onClick={() => copyToClipboard(token.hex)}
                title="Clique para copiar o código HEX"
              >
                {/* Color Swatch Block */}
                <div
                  style={{
                    height: "130px",
                    background: token.bgStyle,
                    color: token.textColor,
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "-0.01em" }}>{token.hex}</span>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "999px",
                        background: "rgba(0,0,0,0.2)",
                        fontSize: "11px",
                        backdropFilter: "blur(4px)"
                      }}
                    >
                      Copiar HEX
                    </span>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: token.textColor }}>{token.name}</h3>
                  </div>
                </div>

                {/* Details Block */}
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--folha)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {token.role}
                  </span>
                  <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "rgba(224, 219, 199, 0.8)", fontFamily: "monospace" }}>
                    <span>{token.rgb}</span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "rgba(224, 219, 199, 0.6)", fontFamily: "monospace" }}>
                    <span>{token.cmyk}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.4 }}>
                    {token.usage}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2: BUTTONS & INTERACTIVE COMPONENTS */}
      {(activeTab === "components" || activeTab === "colors") && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "10px" }}>
          <h2>2. Componentes de Interface & Interações</h2>

          {/* Buttons Matrix */}
          <ShellCard>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#E0DBC7" }}>Sistema de Botões & Hover States</h3>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "13px" }}>
                    Variantes projetadas para alta legibilidade e ações prioritárias no sistema.
                  </p>
                </div>
                <span className="status-pill status-pill--success">Interativo</span>
              </div>

              {/* Row 1: Primary Variants */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "160px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                  Laranja Intenso (Primary CTA)
                </div>
                <button type="button" className="button button--primary">
                  Ação Principal
                </button>
                <button type="button" className="button button--primary" style={{ padding: "12px 24px", fontSize: "14px" }}>
                  Ação Grande
                </button>
                <button type="button" className="button button--primary" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  Ação Pequena
                </button>
                <button type="button" className="button button--primary" disabled>
                  Desabilitado
                </button>
              </div>

              {/* Row 2: Secondary Leaf Green */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "160px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                  Verde Folha (Secondary)
                </div>
                <button type="button" className="button button--secondary">
                  Ação Secundária
                </button>
                <button type="button" className="button button--secondary" style={{ padding: "12px 24px", fontSize: "14px" }}>
                  Confirmar Operação
                </button>
                <button type="button" className="button button--secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  Aprovado
                </button>
                <button type="button" className="button button--secondary" disabled>
                  Desabilitado
                </button>
              </div>

              {/* Row 3: Areia Sand Button */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "160px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                  Areia (Sand Accent)
                </div>
                <button type="button" className="button button--sand">
                  Botão Areia
                </button>
                <button type="button" className="button button--sand" style={{ padding: "12px 24px", fontSize: "14px" }}>
                  Filtrar Dados
                </button>
                <button type="button" className="button button--sand" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  Tag Areia
                </button>
                <button type="button" className="button button--sand" disabled>
                  Desabilitado
                </button>
              </div>

              {/* Row 4: Woody Beige Button */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "160px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                  Bege Amadeirado
                </div>
                <button type="button" className="button button--woody">
                  Botão Amadeirado
                </button>
                <button type="button" className="button button--woody" style={{ padding: "12px 24px", fontSize: "14px" }}>
                  Exportar Relatório
                </button>
                <button type="button" className="button button--woody" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  Suporte
                </button>
                <button type="button" className="button button--woody" disabled>
                  Desabilitado
                </button>
              </div>

              {/* Row 5: Outline Glass / Ghost */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "160px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                  Glassware & Ghost
                </div>
                <button type="button" className="button">
                  Glass Padrão
                </button>
                <button type="button" className="button button--ghost">
                  Ghost Button
                </button>
              </div>
            </div>
          </ShellCard>

          {/* Form Controls & Inputs Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {/* Input Controls */}
            <ShellCard>
              <h3 style={{ marginTop: 0, marginBottom: "14px", color: "#E0DBC7" }}>Campos de Entrada & Formulários</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "12.5px", color: "var(--muted)", fontWeight: 500 }}>
                    Campo de Texto Padrão
                  </label>
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(0, 51, 51, 0.4)",
                      border: "1px solid rgba(224, 219, 199, 0.2)",
                      borderRadius: "12px",
                      color: "#E0DBC7",
                      fontFamily: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "12.5px", color: "var(--muted)", fontWeight: 500 }}>
                    Seletor Dropdown (Select)
                  </label>
                  <select
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(0, 51, 51, 0.6)",
                      border: "1px solid rgba(224, 219, 199, 0.2)",
                      borderRadius: "12px",
                      color: "#E0DBC7",
                      fontFamily: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  >
                    <option value="plugga">Empresa: Plugga OS</option>
                    <option value="waze">Empresa: Waze Energia</option>
                  </select>
                </div>
              </div>
            </ShellCard>

            {/* Status Badges & Tags */}
            <ShellCard>
              <h3 style={{ marginTop: 0, marginBottom: "14px", color: "#E0DBC7" }}>Badges & Tags de Status</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <StatusPill variant="success">Verde Folha (Sucesso)</StatusPill>
                  <StatusPill variant="warning">Laranja (Atenção)</StatusPill>
                  <StatusPill variant="danger">Erro / Crítico</StatusPill>
                  <StatusPill variant="neutral">Neutro / Rascunho</StatusPill>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                  <span style={{ padding: "4px 12px", borderRadius: "999px", background: "linear-gradient(135deg, #F25601, #D94C00)", color: "#fff", fontSize: "12px", fontWeight: 600 }}>
                    Laranja Intenso
                  </span>
                  <span style={{ padding: "4px 12px", borderRadius: "999px", background: "linear-gradient(135deg, #00AF88, #008767)", color: "#fff", fontSize: "12px", fontWeight: 600 }}>
                    Verde Folha
                  </span>
                  <span style={{ padding: "4px 12px", borderRadius: "999px", background: "#E0DBC7", color: "#003333", fontSize: "12px", fontWeight: 600 }}>
                    Areia Tag
                  </span>
                  <span style={{ padding: "4px 12px", borderRadius: "999px", background: "#D6B896", color: "#003333", fontSize: "12px", fontWeight: 600 }}>
                    Bege Amadeirado
                  </span>
                </div>
              </div>
            </ShellCard>
          </div>

          {/* Table Preview */}
          <ShellCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0 16px" }}>
              <h3 style={{ margin: 0, color: "#E0DBC7" }}>Tabela de Exemplo com Estilos do Design System</h3>
              <span className="status-pill status-pill--success">Grid Responsivo</span>
            </div>
            <ShellTable caption="Tabela de exemplo de componentes">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Departamento</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontFamily: "monospace", color: "#E0DBC7" }}>#PLG-2025-01</td>
                  <td style={{ fontWeight: 600, color: "#fff" }}>Usina Solar Alfa</td>
                  <td>Energia OPM</td>
                  <td><StatusPill variant="success">Em Operação</StatusPill></td>
                  <td style={{ fontWeight: 600, color: "#E0DBC7" }}>R$ 48.500,00</td>
                  <td>
                    <button type="button" className="button button--secondary" style={{ padding: "4px 10px", fontSize: "11.5px" }}>
                      Ver Ficha
                    </button>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontFamily: "monospace", color: "#E0DBC7" }}>#PLG-2025-02</td>
                  <td style={{ fontWeight: 600, color: "#fff" }}>Eletroposto Central</td>
                  <td>Eletromobilidade</td>
                  <td><StatusPill variant="warning">Pendente Liberação</StatusPill></td>
                  <td style={{ fontWeight: 600, color: "#E0DBC7" }}>R$ 12.300,00</td>
                  <td>
                    <button type="button" className="button button--primary" style={{ padding: "4px 10px", fontSize: "11.5px" }}>
                      Aprovar
                    </button>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontFamily: "monospace", color: "#E0DBC7" }}>#PLG-2025-03</td>
                  <td style={{ fontWeight: 600, color: "#fff" }}>Complexo Industrial Beta</td>
                  <td>Comercial Obras</td>
                  <td><StatusPill variant="neutral">Em Análise</StatusPill></td>
                  <td style={{ fontWeight: 600, color: "#E0DBC7" }}>R$ 184.000,00</td>
                  <td>
                    <button type="button" className="button button--woody" style={{ padding: "4px 10px", fontSize: "11.5px" }}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              </tbody>
            </ShellTable>
          </ShellCard>
        </section>
      )}

      {/* SECTION 3: SPACING & RADIUS TOKENS */}
      {(activeTab === "layout" || activeTab === "components") && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h2>3. Tokens de Espaçamento e Border Radius</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {/* Spacing Tokens Card */}
            <ShellCard>
              <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#E0DBC7" }}>Escala de Espaçamento</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {SPACING_TOKENS.map((sp) => (
                  <div key={sp.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "120px", fontSize: "12px", fontFamily: "monospace", color: "var(--folha)" }}>{sp.name}</div>
                    <div style={{ width: "50px", fontSize: "12.5px", fontWeight: 600, color: "#fff" }}>{sp.size}</div>
                    <div
                      style={{
                        height: "18px",
                        width: sp.size,
                        background: "#F25601",
                        borderRadius: "3px",
                        boxShadow: "0 0 8px rgba(242, 86, 1, 0.4)"
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "auto" }}>{sp.label}</span>
                  </div>
                ))}
              </div>
            </ShellCard>

            {/* Radius Tokens Card */}
            <ShellCard>
              <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#E0DBC7" }}>Escala de Border Radius</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {RADIUS_TOKENS.map((rad) => (
                  <div key={rad.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "120px", fontSize: "12px", fontFamily: "monospace", color: "var(--folha)" }}>{rad.name}</div>
                    <div style={{ width: "50px", fontSize: "12.5px", fontWeight: 600, color: "#fff" }}>{rad.size}</div>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        background: "rgba(0, 175, 136, 0.2)",
                        border: "2px solid #00AF88",
                        borderRadius: rad.size
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "auto" }}>{rad.label}</span>
                  </div>
                ))}
              </div>
            </ShellCard>
          </div>
        </section>
      )}

      {/* SECTION 4: TYPOGRAPHY SYSTEM */}
      {(activeTab === "typography" || activeTab === "components") && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h2>4. Sistema Tipográfico (Articulat CF)</h2>

          <ShellCard>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "16px" }}>
                <span className="eyebrow">EYEBROW / KICKER · 11PX MEDIUM UPPERCASE</span>
                <h1 style={{ margin: "6px 0 4px", color: "#fff" }}>H1 Display Heading (32px Bold)</h1>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "15px" }}>
                  Subtítulo de apoio da página em Articulat CF Regular, com excelente legibilidade sobre fundo escuro Verde Petróleo.
                </p>
              </div>

              <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "16px" }}>
                <h2 style={{ margin: "0 0 6px", color: "#E0DBC7" }}>H2 Section Title (22px Medium)</h2>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
                  Usado para títulos de seções principais, tabelas e grandes blocos da interface.
                </p>
              </div>

              <div>
                <h3 style={{ margin: "0 0 6px", color: "#E0DBC7" }}>H3 Card Heading (18px Medium)</h3>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "13.5px" }}>
                  Usado em cabeçalhos de ShellCard e modais de interação.
                </p>
              </div>
            </div>
          </ShellCard>
        </section>
      )}
    </div>
  );
}
