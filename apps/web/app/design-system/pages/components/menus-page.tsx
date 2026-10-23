"use client";

import { useState } from "react";
import { DropdownMenu } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

const COLUMNS = ["Nome", "Valor", "Status"];

export function MenusPage() {
  const [message, setMessage] = useState("Nenhuma ação executada.");
  const [columns, setColumns] = useState(COLUMNS);
  return <DocPage title="Menus suspensos" category="Ações e navegação" description="Reúna ações secundárias e preferências em um menu compacto. Ações fecham o menu; escolhas com check permanecem abertas.">
    <DocSection title="Ações e menus com check" description="Enter abre. Setas percorrem os itens, Home e End vão às extremidades, e Escape fecha.">
      <Playground title="Menus interativos" preview={<div className="ds-two-columns">
        <div className="ds-stack"><DropdownMenu label="Ações do projeto" items={[
          { id: "edit", label: "Editar projeto", onSelect: () => setMessage("Edição selecionada.") },
          { id: "copy", label: "Duplicar exemplo", onSelect: () => setMessage("Duplicação simulada.") },
          { id: "export", label: "Exportar (indisponível)", disabled: true, onSelect: () => {} },
          { id: "delete", label: "Excluir exemplo", danger: true, onSelect: () => setMessage("Exclusão simulada. Nenhum registro foi removido.") },
        ]} /><p role="status" className="ds-demo-note">{message}</p></div>
        <div className="ds-stack"><DropdownMenu label="Colunas visíveis" items={COLUMNS.map((label) => ({ id: label, label, checked: columns.includes(label), onSelect: () => setColumns(columns.includes(label) ? columns.filter((item) => item !== label) : [...columns, label]) }))} /><p role="status" className="ds-demo-note">Visíveis: {columns.join(", ") || "nenhuma coluna"}.</p></div>
      </div>} />
      <Usage>{'import { DropdownMenu } from "../components/ui";\n\n<DropdownMenu label="Colunas visíveis" items={[\n  { id: "valor", label: "Valor", checked: mostrarValor,\n    onSelect: () => setMostrarValor(!mostrarValor) },\n]} />\n// Sem checked, o item é uma ação e fecha o menu ao executar.'}</Usage>
    </DocSection>
  </DocPage>;
}
