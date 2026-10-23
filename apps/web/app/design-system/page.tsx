"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SECTIONS } from "./registry";
import { IconSearch, IconX, IconArrowRight } from "./icons";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

export default function DesignSystemPage() {
  const params = useSearchParams();
  const slug = params.get("item") ?? "overview";
  const activeSection = SECTIONS.find((section) => section.items.some((item) => item.slug === slug)) ?? SECTIONS[0]!;
  const activeItem = activeSection.items.find((item) => item.slug === slug) ?? activeSection.items[0]!;
  const [search, setSearch] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const previousSlug = useRef(slug);
  const query = normalize(search);
  const groups = SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) =>
    normalize(`${item.title} ${item.slug} ${item.keywords ?? ""} ${section.title}`).includes(query)) })).filter((section) => section.items.length > 0);
  const ActiveComponent = activeItem.component;

  useEffect(() => {
    if (previousSlug.current !== slug) { main.current?.scrollTo(0, 0); main.current?.focus(); }
    previousSlug.current = slug;
  }, [slug]);

  return <div className="ds-shell">
    <a href="#ds-main" className="ds-skip">Pular para o conteúdo</a>
    <aside id="ds-navigation" className={`ds-sidebar ${navOpen ? "ds-sidebar--open" : ""}`} aria-label="Biblioteca de componentes">
      <Link href="/design-system" className="ds-brand" onClick={() => { setSearch(""); setNavOpen(false); }}>
        <Image src="/brand/logo-areia.svg" alt="Plugga" width={120} height={32} priority />
        <span className="ds-brand-subtitle">Design System</span>
      </Link>
      <div className="ds-search-box">
        <IconSearch aria-hidden="true" />
        <input type="search" aria-label="Buscar componentes" placeholder="Buscar componentes…" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")}><IconX aria-hidden="true" /></button>}
      </div>
      <nav aria-label="Componentes do Design System" className="ds-navigation">
        {groups.map((section) => <div className="ds-nav-group" key={section.slug}>
          <span className="ds-nav-label">{section.title}</span>
          {section.items.map((item) => <Link href={`/design-system?item=${item.slug}`} scroll={false}
            key={item.slug} aria-current={activeItem.slug === item.slug ? "page" : undefined}
            className="ds-nav-item" onClick={() => { setSearch(""); setNavOpen(false); }}>
            <span>{item.title}</span>{activeItem.slug === item.slug && <span aria-hidden="true" className="ds-nav-dot" />}
          </Link>)}
        </div>)}
        {groups.length === 0 && <p className="ds-no-results" role="status">Nenhum componente encontrado.</p>}
      </nav>
      <div className="ds-sidebar-footer"><span className="ds-local-dot" />Ambiente de desenvolvimento</div>
    </aside>
    <div className="ds-workspace">
      <header className="ds-topbar">
        <button type="button" className="ds-mobile-toggle" aria-controls="ds-navigation" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}><span aria-hidden="true">☰</span><span>Componentes</span></button>
        <div className="ds-breadcrumb"><span>Design System</span><span aria-hidden="true">/</span><strong>{activeItem.title}</strong></div>
        <Link href="/" className="ds-back-link">Voltar ao sistema <IconArrowRight aria-hidden="true" /></Link>
      </header>
      <main id="ds-main" ref={main} tabIndex={-1} className="ds-content">
        <div className="ds-content-inner"><ActiveComponent key={activeItem.slug} /></div>
        <footer className="ds-content-footer">Plugga OS <span>Componentes compartilhados. Experiência consistente.</span></footer>
      </main>
    </div>
  </div>;
}
