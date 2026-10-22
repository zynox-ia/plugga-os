import { DocPage, DocSection } from "../../kit/doc";
import { TYPOGRAPHY_TOKENS } from "../../tokens";

export function TypographyPage() {
  return <DocPage title="Tipografia" category="Fundamentos" description="General Sans é a família da interface. Pesos regulares sustentam a leitura; peso médio estabelece hierarquia sem competir com os dados.">
    <DocSection title="Escala de referência" description="Títulos se adaptam à largura da tela. Rótulos e textos de apoio mantêm uma leitura confortável.">
      <div className="ds-type-list">{TYPOGRAPHY_TOKENS.map((token) => <div className="ds-type-row" key={token.role}>
        <div><strong>{token.role}</strong><p>{token.size} · peso {token.weight}</p></div>
        <span style={{ fontSize: token.size, fontWeight: token.weight }}>{token.example}</span>
      </div>)}</div>
    </DocSection>
    <DocSection title="Hierarquia de conteúdo" description="Um título principal por página, seções em h2 e subdivisões em h3. Reservamos a fonte monoespaçada para valores técnicos e trechos de código." />
  </DocPage>;
}
