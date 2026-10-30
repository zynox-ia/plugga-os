"use client";

import { useState } from "react";
import { Button, DatePicker, IconCheck } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function DatesPage() {
  const [date, setDate] = useState("2026-10-22");
  const [saved, setSaved] = useState(false);
  return <DocPage title="Datas e calendário" category="Formulários" description="Digite uma data ou escolha um dia no calendário. O formato, os controles e os estados seguem o mesmo padrão em todas as telas.">
    <DocSection title="Uma data, duas formas de escolher" description="Formato brasileiro, navegação entre meses e atalhos para hoje ou para limpar a seleção.">
      <Playground title="Experimente o calendário" preview={<form className="ds-stack" onChange={() => setSaved(false)} onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
        <div className="ds-two-columns"><DatePicker label="Data da operação" name="data" required value={date} onChange={(next) => { setDate(next); setSaved(false); }} /><DatePicker label="Data opcional" /></div>
        <div className="ds-row"><Button icon={<IconCheck />} type="submit">Confirmar data</Button>{saved && <span role="status" className="ds-demo-note">Data confirmada no exemplo.</span>}</div>
      </form>} />
    </DocSection>
    <DocSection title="Limites e estados" description="As mesmas regras valem para uma data digitada ou escolhida no calendário.">
      <Playground title="Período permitido" preview={<div className="ds-two-columns">
        <DatePicker label="Dentro do período" defaultValue="2026-10-22" min="2026-10-01" max="2026-12-31" hint="De 01/10/2026 a 31/12/2026." />
        <DatePicker label="Data desabilitada" defaultValue="2026-10-22" disabled />
        <DatePicker label="Data somente leitura" defaultValue="2026-10-22" readOnly />
        <DatePicker label="Data com erro" error="Escolha uma nova data para continuar." />
      </div>} />
      <Usage>{'import { DatePicker, SelectField } from "../components/ui";\n\n<DatePicker label="Data de início" value={data}\n  onChange={setData} min="2026-01-01" max="2026-12-31" />\n// Valor: "2026-10-22". Exibição: "22/10/2026".\n\n<SelectField label="Categoria" options={categorias}\n  value={categoria} onChange={setCategoria} />\n// Select, Popover e Calendar: shadcn/ui com o tema Plugga.'}</Usage>
    </DocSection>
  </DocPage>;
}
