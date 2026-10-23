"use client";

import { useState } from "react";
import { Badge, Checkbox, EmptyState, TextField } from "../../../components/ui";
import { ShellTable } from "../../../components/plugga-shell";
import { DocPage, DocSection, Usage } from "../../kit/doc";

const ROWS = [
  { id: "DEMO-001", name: "Projeto Aurora", category: "Gestão de energia", value: "R$ 12.400", status: "Em análise" },
  { id: "DEMO-002", name: "Projeto Horizonte", category: "Mercado livre", value: "R$ 8.600", status: "Concluído" },
  { id: "DEMO-003", name: "Projeto Nascente", category: "Geração distribuída", value: "R$ 21.000", status: "Aguardando revisão" },
];

export function TablesPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const rows = ROWS.filter((row) => normalize(`${row.name} ${row.id}`).includes(normalize(search)));
  const count = rows.filter((row) => selected.includes(row.id)).length;
  return <DocPage title="Tabelas" category="Dados e superfícies" description="Priorize a comparação entre registros. Cabeçalhos claros, números alinhados e seleção explícita ajudam a trabalhar com dados.">
    <DocSection title="Listagem de operações" description="Dados demonstrativos. A seleção geral afeta apenas as linhas visíveis no filtro.">
      <div className="ds-data-surface">
        <div className="ds-table-toolbar"><TextField label="Buscar operações" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou código…" /><span role="status" className="ds-demo-note">{selected.length} selecionadas</span></div>
        {rows.length > 0 ? <ShellTable caption="Operações demonstrativas">
          <thead><tr><th scope="col"><Checkbox label="Selecionar linhas visíveis" checked={count === rows.length} indeterminate={count > 0 && count < rows.length} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...rows.map((row) => row.id)])] : selected.filter((id) => !rows.some((row) => row.id === id)))} /></th><th scope="col">Operação</th><th scope="col">Categoria</th><th scope="col" className="ds-number">Valor</th><th scope="col">Status</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td><Checkbox label={`Selecionar ${row.name}`} checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td><td><strong>{row.name}</strong><small>{row.id}</small></td><td>{row.category}</td><td className="ds-number">{row.value}</td><td><Badge tone={row.status === "Concluído" ? "success" : row.status === "Em análise" ? "info" : "warning"}>{row.status}</Badge></td></tr>)}</tbody>
        </ShellTable> : <EmptyState title="Nenhuma operação encontrada">Tente buscar outro nome ou código.</EmptyState>}
        <div className="ds-data-footer">{rows.length} de {ROWS.length} operações · dados de exemplo</div>
      </div>
      <Usage>{'import { ShellTable } from "../components/plugga-shell";\nimport { Badge, Checkbox } from "../components/ui";\n\n<ShellTable caption="Operações">\n  <thead><tr><th scope="col">Nome</th></tr></thead>\n  <tbody><tr><td>Projeto de exemplo</td></tr></tbody>\n</ShellTable>'}</Usage>
    </DocSection>
  </DocPage>;
}
