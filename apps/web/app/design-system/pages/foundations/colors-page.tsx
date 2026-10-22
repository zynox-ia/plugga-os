"use client";

import { useEffect, useState } from "react";
import { DocPage, DocSection, CodeBadge } from "../../kit/doc";
import { CopyButton } from "../../kit/copy-button";
import { BLUE_TONAL_SCALE, SURFACE_TOKENS, STATUS_TOKENS, type ColorToken } from "../../tokens";

function Palette({ tokens }: { tokens: ColorToken[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(tokens.map((token) => [token.cssVar, style.getPropertyValue(token.cssVar).trim()])));
  }, [tokens]);
  return <div className="ds-swatch-grid">{tokens.map((token) => <CopyButton key={token.cssVar} label={token.name} value={values[token.cssVar] ?? `var(${token.cssVar})`} className="ds-swatch-card">
    <span className="ds-swatch-box" style={{ background: `var(${token.cssVar})` }} aria-hidden="true" />
    <strong>{token.name}</strong><CodeBadge>{token.cssVar}</CodeBadge><span className="ds-token-value">{values[token.cssVar] ?? "…"}</span><span className="ds-demo-note">{token.usage}</span>
  </CopyButton>)}</div>;
}

export function ColorsPage() {
  return <DocPage title="Cores" category="Fundamentos" description="O marinho dá estrutura; o azul destaca ações. As amostras abaixo leem os valores reais das variáveis CSS da aplicação.">
    <DocSection title="Paleta da interface" description="Selecione uma cor para copiar o valor aplicado no navegador."><Palette tokens={BLUE_TONAL_SCALE} /></DocSection>
    <DocSection title="Superfícies e divisórias"><Palette tokens={SURFACE_TOKENS} /></DocSection>
    <DocSection title="Cores semânticas" description="Combine a cor com um texto ou ícone. As cores de texto dos alertas são mais escuras para manter a leitura nos fundos claros."><Palette tokens={STATUS_TOKENS} /></DocSection>
  </DocPage>;
}
