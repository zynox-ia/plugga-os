"use client";

import { useId, useState } from "react";
import { Checkbox, Radio, Switch } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

const OPTIONS = ["Relatórios", "Operações", "Contratos"];

export function SelectionPage() {
  const group = useId();
  const [checked, setChecked] = useState(["Operações"]);
  const [frequency, setFrequency] = useState("semanal");
  return <DocPage title="Checkbox, radio e switch" category="Formulários" description="Checkbox permite várias escolhas. Radio define uma opção do grupo. Switch liga ou desliga uma configuração imediatamente.">
    <DocSection title="Controles de escolha" description="Todos funcionam com Tab e Espaço. No grupo de radios, as setas alternam a opção.">
      <Playground title="Seleção e preferências" preview={<div className="ds-three-columns">
        <fieldset className="ds-demo-group"><legend>Seleção múltipla</legend>
          <Checkbox label="Selecionar todos" checked={checked.length === OPTIONS.length} indeterminate={checked.length > 0 && checked.length < OPTIONS.length} onChange={(event) => setChecked(event.target.checked ? OPTIONS : [])} />
          {OPTIONS.map((label) => <Checkbox key={label} label={label} checked={checked.includes(label)} onChange={(event) => setChecked(event.target.checked ? [...checked, label] : checked.filter((item) => item !== label))} />)}
          <p className="ds-demo-note" role="status">{checked.length} de {OPTIONS.length} selecionados</p>
        </fieldset>
        <fieldset className="ds-demo-group"><legend>Frequência dos relatórios</legend>
          <Radio name={group} value="semanal" label="Semanal" checked={frequency === "semanal"} onChange={() => setFrequency("semanal")} />
          <Radio name={group} value="mensal" label="Mensal" checked={frequency === "mensal"} onChange={() => setFrequency("mensal")} />
          <Radio name={group} value="anual" label="Anual" disabled />
        </fieldset>
        <div className="ds-stack"><Switch label="Notificações por e-mail" defaultChecked /><Switch label="Resumo diário" description="Receba um resumo das atividades." /><Switch label="Configuração indisponível" disabled /></div>
      </div>} />
    </DocSection>
    <DocSection title="Estados explícitos" description="O traço no checkbox indica uma seleção parcial; ele não representa erro.">
      <Playground title="Referência de estados" preview={<div className="ds-row"><Checkbox label="Disponível" /><Checkbox label="Selecionado" defaultChecked /><Checkbox label="Parcial" indeterminate /><Checkbox label="Desabilitado" disabled /><Checkbox label="Selecionado e desabilitado" defaultChecked disabled /></div>} />
      <Usage>{'import { Checkbox, Radio, Switch } from "../components/ui";\n\n<Checkbox label="Selecionar todos" checked={todos}\n  indeterminate={parcial} onChange={alternarTodos} />\n<Radio name="frequencia" value="mensal" label="Mensal" />\n<Switch label="Receber atualizações" checked={ativo}\n  onChange={(e) => setAtivo(e.target.checked)} />'}</Usage>
    </DocSection>
  </DocPage>;
}
