import { Badge, Card } from "../../../components/ui";
import { DocPage, DocSection, Usage } from "../../kit/doc";

export function CardsPage() {
  return <DocPage title="Cartões" category="Dados e superfícies" description="Agrupe informações relacionadas em uma superfície. Use cartões claros para o trabalho cotidiano e o marinho para dar ênfase a um resumo.">
    <DocSection title="Superfícies compartilhadas" description="Os cartões reutilizam a base de superfícies do sistema.">
      <div className="ds-two-columns">
        <Card><div className="ds-card-heading"><h3>Operações em andamento</h3><Badge tone="info">Demonstração</Badge></div><strong className="ds-metric">24</strong><p className="ds-demo-note">Distribuídas entre análise, proposta e contratação.</p><div className="ds-card-footer"><span>Concluídas neste mês</span><Badge tone="success">8 operações</Badge></div></Card>
        <Card tone="dark"><div className="ds-card-heading"><h3>Visão da equipe</h3><span className="ds-dark-label">Resumo</span></div><strong className="ds-metric">92%</strong><p className="ds-demo-note">Das tarefas demonstrativas estão dentro do prazo.</p><div className="ds-card-footer"><span>Atualização do exemplo</span><strong>Agora</strong></div></Card>
      </div>
      <Usage>{'import { Card, Badge } from "../components/ui";\n\n<Card>\n  <h3>Operações em andamento</h3>\n  <Badge tone="info">Em análise</Badge>\n</Card>\n<Card tone="dark">Resumo da operação</Card>'}</Usage>
    </DocSection>
  </DocPage>;
}
