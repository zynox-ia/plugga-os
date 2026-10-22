"use client";

import { useState } from "react";
import { Badge, MultiSelect } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function TagsPage() {
  const [tags, setTags] = useState(["energia", "comercial"]);
  return <DocPage title="Tags e indicadores" category="Dados e superfícies" description="Indicadores comunicam o estado de um registro. Tags representam categorias e podem permitir remoção quando são escolhas editáveis.">
    <DocSection title="Estados semânticos" description="O texto explica o estado; a cor apenas reforça a leitura.">
      <Playground title="Indicadores de status" preview={<div className="ds-row"><Badge>Rascunho</Badge><Badge tone="info">Em análise</Badge><Badge tone="success">Concluído</Badge><Badge tone="warning">Aguardando revisão</Badge><Badge tone="danger">Com pendência</Badge></div>} />
    </DocSection>
    <DocSection title="Tags removíveis" description="Use as tags para mostrar e editar os itens de uma seleção múltipla.">
      <Playground title="Categorias do exemplo" preview={<MultiSelect label="Categorias" options={[{ value: "energia", label: "Energia" }, { value: "comercial", label: "Comercial" }, { value: "operacoes", label: "Operações" }]} value={tags} onChange={setTags} />} />
      <Usage>{'import { Badge, MultiSelect } from "../components/ui";\n\n<Badge tone="success">Concluído</Badge>\n<Badge tone="warning">Aguardando revisão</Badge>\n<MultiSelect label="Categorias" options={opcoes}\n  value={selecionados} onChange={setSelecionados} />'}</Usage>
    </DocSection>
  </DocPage>;
}
