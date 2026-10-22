"use client";

import { useState } from "react";
import { Combobox, MultiSelect, SelectField, type SelectOption } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

const DISTRIBUTORS: SelectOption[] = [
  { value: "norte", label: "Distribuidora Norte", description: "Exemplo · região Norte" },
  { value: "sul", label: "Distribuidora Sul", description: "Exemplo · região Sul" },
  { value: "centro", label: "Distribuidora Centro", description: "Exemplo · região Centro-Oeste" },
  { value: "leste", label: "Distribuidora Leste", description: "Indisponível", disabled: true },
];
const SERVICES = [
  { value: "gestao", label: "Gestão de energia" },
  { value: "acl", label: "Mercado livre" },
  { value: "gd", label: "Geração distribuída" },
];

export function SelectorsPage() {
  const [distributor, setDistributor] = useState("norte");
  const [services, setServices] = useState(["gestao"]);
  return <DocPage title="Seletores" category="Formulários" description="Escolha simples, busca em listas e seleção múltipla. Cada controle deixa claro o que pode ser selecionado e qual é o valor atual.">
    <DocSection title="Seleção simples e com busca" description="Use a lista simples para poucas opções. A busca ajuda a encontrar itens em listas maiores.">
      <Playground title="Escolha uma opção" preview={<div className="ds-two-columns">
        <SelectField label="Etapa da operação" defaultValue="analise" hint="Menu do sistema com navegação por teclado." options={[{ value: "analise", label: "Em análise" }, { value: "proposta", label: "Proposta enviada" }, { value: "contrato", label: "Em contratação" }, { value: "arquivada", label: "Arquivada (indisponível)", disabled: true }]} />
        <Combobox label="Distribuidora" options={DISTRIBUTORS} value={distributor} onChange={setDistributor} hint="Digite para filtrar. Use as setas e Enter para selecionar." />
      </div>} />
    </DocSection>
    <DocSection title="Seleção múltipla" description="Marque mais de uma opção no menu ou remova uma escolha diretamente pelo chip.">
      <Playground title="Serviços da operação" preview={<div className="ds-two-columns"><MultiSelect label="Serviços" options={SERVICES} value={services} onChange={setServices} /><div className="ds-stack"><p className="ds-demo-note">O menu permanece aberto enquanto você escolhe. Escape fecha e devolve o foco ao botão.</p><SelectField label="Seletor desabilitado" disabled defaultValue="restrito" options={[{ value: "restrito", label: "Sem opções disponíveis" }]} /></div></div>} />
      <Usage>{'import { SelectField, Combobox, MultiSelect } from "../components/ui";\n\n<SelectField label="Etapa" options={etapas}\n  value={etapa} onChange={setEtapa} />\n<Combobox label="Distribuidora" options={opcoes}\n  value={distribuidora} onChange={setDistribuidora} />\n<MultiSelect label="Serviços" options={servicos}\n  value={selecionados} onChange={setSelecionados} />\n// Opção: { value: "id", label: "Nome", disabled?: true }'}</Usage>
    </DocSection>
  </DocPage>;
}
