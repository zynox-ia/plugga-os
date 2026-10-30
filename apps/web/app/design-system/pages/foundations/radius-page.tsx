import { DocPage, DocSection, CodeBadge } from "../../kit/doc";
import { RADIUS_TOKENS } from "../../tokens";

export function RadiusPage() {
  return <DocPage title="Bordas e raios" category="Fundamentos" description="A curvatura acompanha a escala do elemento: precisa nos campos, suave nas superfícies e completa nos botões.">
    <DocSection title="Escala de raios">
      <div className="ds-three-columns">{RADIUS_TOKENS.map((token) => <div className="ds-radius-card" key={token.name}>
        <span className="ds-radius-preview" style={{ borderRadius: `var(${token.name})` }} aria-hidden="true" />
        <CodeBadge>{token.name}</CodeBadge><strong>{token.size}</strong><p className="ds-demo-note">{token.usage}</p>
      </div>)}</div>
    </DocSection>
    <DocSection title="Bordas com uma função" description="Use divisórias suaves para agrupar conteúdo e bordas mais definidas nos campos interativos. Nos campos, o foco usa um fundo neutro discreto. Um check verde à direita identifica a opção selecionada nos menus." />
  </DocPage>;
}
