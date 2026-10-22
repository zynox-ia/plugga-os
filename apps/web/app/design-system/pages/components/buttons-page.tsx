"use client";

import { useState } from "react";
import { Button, Checkbox, SelectField, type ButtonProps } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";
import { IconPlus, IconTrash } from "../../icons";

export function ButtonsPage() {
  const [variant, setVariant] = useState<ButtonProps["variant"]>("primary");
  const [size, setSize] = useState<ButtonProps["size"]>("md");
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [message, setMessage] = useState("Clique em um botão para experimentar.");
  return <DocPage title="Botões" category="Ações e navegação" description="A hierarquia das ações começa aqui. Use um botão primário para a ação principal e variantes discretas para as alternativas.">
    <DocSection title="Uma ação, o destaque certo" description="Os mesmos estilos de botão usados nas telas do sistema.">
      <Playground title="Variantes" preview={<div className="ds-stack"><div className="ds-row">
        <Button onClick={() => setMessage("Ação principal acionada.")}><IconPlus aria-hidden="true" />Nova operação</Button>
        <Button variant="secondary" onClick={() => setMessage("Ação secundária acionada.")}>Exportar</Button>
        <Button variant="ghost" onClick={() => setMessage("Ação discreta acionada.")}>Ver detalhes</Button>
        <Button variant="danger" onClick={() => setMessage("Exclusão simulada. Nenhum registro foi removido.")}><IconTrash aria-hidden="true" />Excluir exemplo</Button>
      </div><p className="ds-demo-note" role="status">{message}</p></div>} />
    </DocSection>
    <DocSection title="Tamanhos e estados" description="Carregamento bloqueia cliques repetidos. Desabilitado indica uma ação indisponível.">
      <Playground title="Configure o botão" preview={<div className="ds-row"><Button variant={variant} size={size} loading={loading} disabled={disabled} onClick={() => setMessage("Exemplo acionado.")}>{loading ? "Salvando…" : "Salvar alterações"}</Button><p className="ds-demo-note">32 / 40 / 48 px · formato arredondado</p></div>}
        controls={<><SelectField label="Variante" value={variant} onChange={(value) => setVariant(value as ButtonProps["variant"])} options={[{ value: "primary", label: "Primário" }, { value: "secondary", label: "Secundário" }, { value: "ghost", label: "Discreto" }, { value: "danger", label: "Destrutivo" }]} /><SelectField label="Tamanho" value={size} onChange={(value) => setSize(value as ButtonProps["size"])} options={[{ value: "sm", label: "Pequeno" }, { value: "md", label: "Padrão" }, { value: "lg", label: "Grande" }]} /><Checkbox label="Carregando" checked={loading} onChange={(event) => setLoading(event.target.checked)} /><Checkbox label="Desabilitado" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} /></>} />
      <Usage>{'import { Button } from "../components/ui";\n\n<Button type="submit" loading={salvando}>Salvar alterações</Button>\n<Button variant="secondary" onClick={cancelar}>Cancelar</Button>\n<Button variant="danger" onClick={pedirConfirmacao}>Excluir</Button>'}</Usage>
    </DocSection>
  </DocPage>;
}
