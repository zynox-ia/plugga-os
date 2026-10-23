"use client";

import { useState } from "react";
import { Alert, Button, Dialog, SelectField, IconEdit, IconInfo, IconTrash } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";
import { INITIAL_PROJECT, ProjectExampleDialog } from "./project-example-dialog";

export function ModalsPage() {
  const [open, setOpen] = useState<"edit" | "confirm" | null>(null);
  const [project, setProject] = useState(INITIAL_PROJECT);
  const [size, setSize] = useState<"estreita" | "media" | "larga">("media");
  const [message, setMessage] = useState("");
  return <DocPage title="Modais e diálogos" category="Feedback" description="Formulários completos com campos, seletores e anexos. Cancelar fica à esquerda; a ação principal, à direita.">
    <DocSection title="Formulários e confirmações" description="Experimente os controles em conjunto. Escape, Cancelar e o clique fora fecham sem salvar.">
      <Playground title="Abra e experimente" preview={<div className="ds-stack">
        <div className="ds-row"><Button icon={<IconEdit />} onClick={() => setOpen("edit")}>Abrir formulário</Button><Button icon={<IconInfo />} variant="secondary" onClick={() => setOpen("confirm")}>Abrir confirmação</Button></div>
        <p className="ds-demo-note">Nome salvo no exemplo: <strong>{project.name}</strong></p>
        {message && <Alert tone="success" title={message} />}
      </div>} controls={<SelectField label="Largura do diálogo" value={size} onChange={(value) => setSize(value as typeof size)} options={[{ value: "estreita", label: "Estreita" }, { value: "media", label: "Média" }, { value: "larga", label: "Larga" }]} />} />
      <Usage>{'import { Dialog, Button, TextField, IconSave } from "../components/ui";\n\n// O Dialog inclui Cancelar à esquerda, ligado ao onClose.\n{aberto && <Dialog title="Editar projeto" onClose={fechar}\n  footer={<Button icon={<IconSave />} type="submit" form="projeto">Salvar alterações</Button>}>\n  <form id="projeto" onSubmit={salvar}>\n    <TextField label="Nome do projeto" required />\n  </form>\n</Dialog>}'}</Usage>
    </DocSection>
    {open === "edit" && <ProjectExampleDialog project={project} size={size} onClose={() => setOpen(null)} onSave={(value) => { setProject(value); setMessage("Alterações salvas no exemplo."); setOpen(null); }} />}
    {open === "confirm" && <Dialog title="Excluir este exemplo?" icon={<IconTrash />} description="Uma ação destrutiva precisa de uma confirmação clara." size="estreita" onClose={() => setOpen(null)} cancelAutoFocus
      footer={<Button icon={<IconTrash />} variant="danger" onClick={() => { setMessage("Exclusão simulada. Nenhum registro foi removido."); setOpen(null); }}>Excluir exemplo</Button>}>
      <p className="ds-demo-note">Esta é uma demonstração. Nenhum dado da aplicação será alterado.</p>
    </Dialog>}
  </DocPage>;
}
