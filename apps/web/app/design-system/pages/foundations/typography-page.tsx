import { DocPage, DocSection, Usage } from "../../kit/doc";
import { TYPOGRAPHY_TOKENS } from "../../tokens";

export function TypographyPage() {
  return <DocPage title="Tipografia" category="Fundamentos" description="General Sans é a família da interface. Pesos regulares sustentam a leitura; peso médio estabelece hierarquia sem competir com os dados.">
    <DocSection title="Escala de referência" description="Cada nível tem uma altura de linha proporcional ao tamanho da fonte. As quebras se equilibram automaticamente conforme a largura disponível.">
      <div className="ds-type-list">{TYPOGRAPHY_TOKENS.map((token) => <div className="ds-type-row" key={token.role}>
        <div><strong>{token.role}</strong><p>{token.size} · peso {token.weight}</p><p>Altura de linha {token.leading}</p></div>
        <span style={{ fontSize: token.size, fontWeight: token.weight, lineHeight: token.lineHeight }}>{token.example}</span>
      </div>)}</div>
    </DocSection>
    <DocSection title="Leitura em várias linhas" description="Títulos mais compactos e parágrafos com respiro. A quebra balanceada distribui o texto entre as linhas e reduz finais curtos e isolados.">
      <div className="ds-type-reading">
        <h3>Uma visão clara para acompanhar cada etapa da operação</h3>
        <p>Reúna as informações da sua equipe em um só lugar. Acompanhe os resultados, organize as próximas entregas e mantenha todos alinhados.</p>
      </div>
      <Usage>{`/* A quebra balanceada é herdada em todo o sistema. */
html { text-wrap-style: balance; }

.titulo { line-height: var(--line-height-title); }
.secao { line-height: var(--line-height-heading); }
.subtitulo { line-height: var(--line-height-subheading); }
.controle { line-height: var(--line-height-control); }
.texto { line-height: var(--line-height-body); }`}</Usage>
    </DocSection>
    <DocSection title="Hierarquia de conteúdo" description="Um título principal por página, seções em h2 e subdivisões em h3. Reservamos a fonte monoespaçada para valores técnicos e trechos de código." />
  </DocPage>;
}
