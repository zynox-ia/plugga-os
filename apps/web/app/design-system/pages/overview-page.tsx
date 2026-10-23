"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Switch, TextField, SelectField, DatePicker, Alert, Heading } from "../../components/ui";
import { DocPage, DocSection } from "../kit/doc";
import { IconPlus, IconArrowRight } from "../icons";

export function OverviewPage() {
  const [saved, setSaved] = useState(false);
  return <DocPage title="Uma linguagem para todo o sistema." category="Biblioteca de interface"
    description="A base visual da Plugga, reunida em um só lugar. Explore os padrões, teste as interações e use os mesmos componentes em cada tela.">
    <div className="ds-overview-grid">
      <section className="ds-overview-form" aria-labelledby="ds-composition-title">
        <div className="ds-example-heading"><div><span className="ds-eyebrow">Componentes em conjunto</span><Heading id="ds-composition-title">Tudo começa com uma boa base.</Heading></div><Badge tone="info">Exemplo</Badge></div>
        <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }} onChange={() => setSaved(false)}>
          <TextField label="Nome da operação" defaultValue="Projeto de demonstração" required hint="Um nome claro facilita encontrar a operação depois." />
          <div className="ds-two-columns"><SelectField label="Categoria" defaultValue="gestao" onChange={() => setSaved(false)} options={[{ value: "gestao", label: "Gestão de energia" }, { value: "acl", label: "Mercado livre" }, { value: "gd", label: "Geração distribuída" }]} /><DatePicker label="Data de início" defaultValue="2026-10-22" onChange={() => setSaved(false)} /></div>
          <Switch label="Receber atualizações" description="Acompanhar as mudanças desta operação." defaultChecked />
          <div className="ds-form-footer"><span>Dados demonstrativos</span><Button icon={<IconPlus />} type="submit">Criar exemplo</Button></div>
          {saved && <Alert tone="success" title="Exemplo criado">A interação foi concluída apenas nesta demonstração.</Alert>}
        </form>
      </section>
      <aside className="ds-overview-principles" aria-label="Princípios da interface">
        <span className="ds-eyebrow">O que nos conecta</span><Heading>Clareza em cada detalhe.</Heading>
        <ol><li><span>01</span><div><h3>Uma identidade</h3><p>Azul-marinho, superfícies leves e General Sans.</p></div></li><li><span>02</span><div><h3>Comportamento previsível</h3><p>Os mesmos estados e interações em toda a experiência.</p></div></li><li><span>03</span><div><h3>Acesso para todos</h3><p>Rótulos claros, foco visível e navegação por teclado.</p></div></li></ol>
        <div className="ds-palette-strip" aria-label="Paleta da interface"><i /><i /><i /><i /><i /></div>
      </aside>
    </div>
    <DocSection title="Encontre o componente certo" description="Organizados pela função que cumprem na interface.">
      <div className="ds-category-links">
        {[
          ["buttons", "Ações e navegação", "Botões, menus e abas", "↗"],
          ["inputs", "Formulários", "Campos, seletores e controles de escolha", "Aa"],
          ["modals", "Feedback", "Modais, alertas e estados", "◉"],
          ["tables", "Dados e superfícies", "Tabelas, cartões e indicadores", "▦"],
        ].map(([slug, title, description, mark]) => <Link key={slug} href={`/design-system?item=${slug}`} className="ds-category-link"><span className="ds-category-mark" aria-hidden="true">{mark}</span><div><h3>{title}</h3><p>{description}</p></div><IconArrowRight aria-hidden="true" /></Link>)}
      </div>
    </DocSection>
  </DocPage>;
}
