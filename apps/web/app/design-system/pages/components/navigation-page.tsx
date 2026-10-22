"use client";

import Link from "next/link";
import { Tabs } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function NavigationPage() {
  return <DocPage title="Abas e navegação" category="Ações e navegação" description="Abas alternam conteúdos do mesmo contexto. Links e trilhas de navegação levam a outros destinos.">
    <DocSection title="Abas de conteúdo" description="Use as setas para alternar as abas. Tab leva ao painel selecionado.">
      <Playground title="Visões de uma operação" preview={<Tabs label="Informações da operação" items={[
        { id: "resumo", label: "Resumo", content: <p className="ds-demo-note">Dados gerais, responsável e etapa atual da operação.</p> },
        { id: "atividade", label: "Atividades", content: <p className="ds-demo-note">Histórico de alterações e próximas tarefas da equipe.</p> },
        { id: "arquivos", label: "Arquivos", content: <p className="ds-demo-note">Documentos vinculados à operação.</p> },
      ]} />} />
    </DocSection>
    <DocSection title="Trilha de navegação" description="O destino atual é texto; os níveis anteriores continuam sendo links.">
      <Playground title="Localização no sistema" preview={<nav aria-label="Exemplo de trilha" className="ds-breadcrumb"><Link href="/design-system">Design System</Link><span aria-hidden="true">/</span><span aria-current="page">Abas e navegação</span></nav>} />
      <Usage>{'import { Tabs } from "../components/ui";\n\n<Tabs label="Informações da operação" items={[\n  { id: "resumo", label: "Resumo", content: <Resumo /> },\n  { id: "atividade", label: "Atividades", content: <Atividades /> },\n]} />'}</Usage>
    </DocSection>
  </DocPage>;
}
