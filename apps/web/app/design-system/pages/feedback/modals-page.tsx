"use client";

import { useState } from "react";
import { Alert, Button, Dialog, SelectField, TextField, IconEdit, IconInfo, IconX, IconSave, IconTrash } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function ModalsPage() {
  const [open, setOpen] = useState<"edit" | "confirm" | null>(null);
  const [name, setName] = useState("Projeto de demonstração");
  const [draft, setDraft] = useState(name);
  const [size, setSize] = useState<"estreita" | "media" | "larga">("media");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return <DocPage title="Modais e diálogos" category="Feedback" description="Use um diálogo para uma tarefa curta ou uma decisão que precisa de atenção. O fundo fica inativo enquanto o foco permanece dentro do modal.">
    <DocSection title="Formulários e confirmações" description="Os exemplos usam o mesmo modal nativo da aplicação. Escape, Cancelar e o clique fora fecham sem salvar.">
      <Playground title="Abra e experimente" preview={<div className="ds-stack">
        <div className="ds-row"><Button icon={<IconEdit />} onClick={() => { setDraft(name); setError(false); setOpen("edit"); }}>Abrir formulário</Button><Button icon={<IconInfo />} variant="secondary" onClick={() => setOpen("confirm")}>Abrir confirmação</Button></div>
        <p className="ds-demo-note">Nome salvo no exemplo: <strong>{name}</strong></p>
        {message && <Alert tone="success" title={message} />}
      </div>} controls={<SelectField label="Largura do diálogo" value={size} onChange={(value) => setSize(value as typeof size)} options={[{ value: "estreita", label: "Estreita" }, { value: "media", label: "Média" }, { value: "larga", label: "Larga" }]} />} />
      <Usage>{'import { Dialog, Button, TextField, IconSave } from "../components/ui";\n\n{aberto && <Dialog title="Editar projeto" onClose={fechar}\n  footer={<Button icon={<IconSave />} type="submit" form="projeto">Salvar alterações</Button>}>\n  <form id="projeto" onSubmit={salvar}>\n    <TextField label="Nome do projeto" required />\n  </form>\n</Dialog>}'}</Usage>
    </DocSection>
    {open === "edit" && <Dialog title="Editar projeto" description="Altere o nome deste exemplo. As mudanças ficam apenas nesta página." size={size} onClose={() => setOpen(null)}
      footer={<><Button icon={<IconX />} variant="secondary" onClick={() => setOpen(null)}>Cancelar</Button><Button icon={<IconSave />} type="submit" form="ds-project-form">Salvar alterações</Button></>}>
      <form id="ds-project-form" noValidate onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) { setError(true); return; } setName(draft.trim()); setMessage("Alterações salvas no exemplo."); setOpen(null); }}>
        <TextField label="Nome do projeto" required autoFocus value={draft} onChange={(event) => { setDraft(event.target.value); setError(false); }} error={error ? "Informe o nome do projeto." : undefined} />
      </form>
    </Dialog>}
    {open === "confirm" && <Dialog title="Excluir este exemplo?" description="Uma ação destrutiva precisa de uma confirmação clara." size="estreita" onClose={() => setOpen(null)}
      footer={<><Button icon={<IconX />} autoFocus variant="secondary" onClick={() => setOpen(null)}>Cancelar</Button><Button icon={<IconTrash />} variant="danger" onClick={() => { setMessage("Exclusão simulada. Nenhum registro foi removido."); setOpen(null); }}>Excluir exemplo</Button></>}>
      <p className="ds-demo-note">Esta é uma demonstração. Nenhum dado da aplicação será alterado.</p>
    </Dialog>}
  </DocPage>;
}
