import { DocPage, DocSection, CodeBadge } from "../../kit/doc";
import { SPACING_TOKENS } from "../../tokens";

export function SpacingPage() {
  return <DocPage title="Espaçamento" category="Fundamentos" description="A proximidade comunica relação. Use intervalos menores dentro de um controle e maiores para separar grupos e seções.">
    <DocSection title="Escala compartilhada" description="As barras usam as mesmas variáveis CSS da aplicação.">
      <div className="ds-token-list">{SPACING_TOKENS.map((token) => <div className="ds-token-row" key={token.name}>
        <div className="ds-space-preview"><span style={{ width: `var(${token.name})` }} /></div>
        <div><CodeBadge>{token.name}</CodeBadge><p>{token.size} · {token.usage}</p></div>
      </div>)}</div>
    </DocSection>
    <DocSection title="Comportamento responsivo" description="Em telas estreitas, os grupos passam para uma coluna. Campos ocupam a largura disponível; tabelas mantêm rolagem dentro da própria área." />
  </DocPage>;
}
