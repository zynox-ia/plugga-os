"use client";

import { useState } from "react";
import { Button, Checkbox, SelectField, IconPlus, IconTrash, IconDownload, IconEye, IconSave, type ButtonProps } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function ButtonsPage() {
  const [variant, setVariant] = useState<ButtonProps["variant"]>("primary");
  const [size, setSize] = useState<ButtonProps["size"]>("md");
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [message, setMessage] = useState("Clique em um botão para experimentar.");
  return <DocPage title="Botões" category="Ações e navegação" description="Três variantes organizam as ações: primário, secundário e destrutivo. Todo botão combina um ícone à esquerda com um rótulo claro.">
    <DocSection title="Uma ação, o destaque certo" description="Exportar e Ver detalhes usam a mesma variante secundária. O hover muda suavemente a cor, sem sombra ou deslocamento.">
      <Playground title="Variantes" preview={<div className="ds-stack"><div className="ds-row">
        <Button icon={<IconPlus />} onClick={() => setMessage("Ação principal acionada.")}>Nova operação</Button>
        <Button variant="secondary" icon={<IconDownload />} onClick={() => setMessage("Ação secundária acionada.")}>Exportar</Button>
        <Button variant="secondary" icon={<IconEye />} onClick={() => setMessage("Detalhes do exemplo consultados.")}>Ver detalhes</Button>
        <Button variant="danger" icon={<IconTrash />} onClick={() => setMessage("Exclusão simulada. Nenhum registro foi removido.")}>Excluir exemplo</Button>
      </div><p className="ds-demo-note" role="status">{message}</p></div>} />
    </DocSection>
    <DocSection title="Tamanhos e estados" description="Carregamento bloqueia cliques repetidos. Desabilitado indica uma ação indisponível.">
      <Playground title="Configure o botão" preview={<div className="ds-row"><Button icon={<IconSave />} variant={variant} size={size} loading={loading} disabled={disabled} onClick={() => setMessage("Exemplo acionado.")}>{loading ? "Salvando…" : "Salvar alterações"}</Button><p className="ds-demo-note">32 / 40 / 48 px · formato arredondado</p></div>}
        controls={<><SelectField label="Variante" value={variant} onChange={(value) => setVariant(value as ButtonProps["variant"])} options={[{ value: "primary", label: "Primário" }, { value: "secondary", label: "Secundário" }, { value: "danger", label: "Destrutivo" }]} /><SelectField label="Tamanho" value={size} onChange={(value) => setSize(value as ButtonProps["size"])} options={[{ value: "sm", label: "Pequeno" }, { value: "md", label: "Padrão" }, { value: "lg", label: "Grande" }]} /><Checkbox label="Carregando" checked={loading} onChange={(event) => setLoading(event.target.checked)} /><Checkbox label="Desabilitado" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} /></>} />
      <Usage>{'import { Button, IconSave, IconDownload, IconTrash } from "../components/ui";\n\n<Button icon={<IconSave />} type="submit" loading={salvando}>\n  Salvar alterações\n</Button>\n<Button variant="secondary" icon={<IconDownload />} onClick={exportar}>\n  Exportar\n</Button>\n<Button variant="danger" icon={<IconTrash />} onClick={pedirConfirmacao}>\n  Excluir\n</Button>'}</Usage>
    </DocSection>
  </DocPage>;
}
