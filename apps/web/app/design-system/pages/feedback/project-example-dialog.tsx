"use client";

import { useState } from "react";
import { ClipboardListIcon, PaperclipIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button, Checkbox, Combobox, CurrencyField, DatePicker, Dialog, FileDropzone, Heading, MultiSelect, Radio, SelectField, Switch, TextareaField, TextField, IconEdit, IconSave } from "../../../components/ui";
import { DISTRIBUTORS, SERVICES } from "../../kit/example-options";

export type ExampleProject = {
  name: string; email: string; category: string; distributor: string; services: string[];
  date: string; budget: string; notes: string; priority: string; review: boolean; notifications: boolean; files: File[];
};
export const INITIAL_PROJECT: ExampleProject = {
  name: "Projeto de demonstração", email: "contato@exemplo.test", category: "gestao", distributor: "norte", services: ["gestao"],
  date: "2026-10-22", budget: "25000", notes: "", priority: "normal", review: false, notifications: true, files: [],
};

export function ProjectExampleDialog({ project, size, onClose, onSave }: {
  project: ExampleProject; size: "estreita" | "media" | "larga"; onClose: () => void; onSave: (project: ExampleProject) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [nameError, setNameError] = useState(false);
  const update = <K extends keyof ExampleProject>(key: K, value: ExampleProject[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <Dialog title="Editar projeto" icon={<IconEdit />} description="Experimente os campos, seletores e anexos. As alterações ficam apenas nesta demonstração." size={size} onClose={onClose}
    footer={<Button icon={<IconSave />} type="submit" form="ds-project-form">Salvar alterações</Button>}>
    <form id="ds-project-form" className="ds-modal-form" noValidate onSubmit={(event) => {
      event.preventDefault();
      if (!draft.name.trim()) { setNameError(true); event.currentTarget.querySelector<HTMLInputElement>('[name="projectName"]')?.focus(); return; }
      if (!event.currentTarget.reportValidity()) return;
      onSave({ ...draft, name: draft.name.trim() });
    }}>
      <section className="ds-modal-section" aria-labelledby="ds-project-information">
        <Heading as="h3" id="ds-project-information" icon={<ClipboardListIcon />}>Informações do projeto</Heading>
        <div className="ds-modal-grid">
          <TextField label="Nome do projeto" name="projectName" required autoFocus value={draft.name} onChange={(event) => { update("name", event.target.value); setNameError(false); }} error={nameError ? "Informe o nome do projeto." : undefined} />
          <TextField label="E-mail de contato" type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} />
          <SelectField label="Categoria" options={SERVICES} value={draft.category} onChange={(value) => update("category", value)} />
          <Combobox label="Distribuidora" options={DISTRIBUTORS} value={draft.distributor} onChange={(value) => update("distributor", value)} />
          <DatePicker label="Data de início" value={draft.date} onChange={(value) => update("date", value)} />
          <MultiSelect label="Serviços" options={SERVICES} value={draft.services} onChange={(value) => update("services", value)} />
          <CurrencyField label="Valor estimado" value={draft.budget} onValueChange={(value) => update("budget", value)} />
          <fieldset className="ds-demo-group"><legend>Prioridade</legend><div className="ds-row">
            <Radio name="projectPriority" label="Normal" checked={draft.priority === "normal"} onChange={() => update("priority", "normal")} />
            <Radio name="projectPriority" label="Alta" checked={draft.priority === "alta"} onChange={() => update("priority", "alta")} />
          </div></fieldset>
        </div>
        <TextareaField label="Observações" placeholder="Descreva os próximos passos e os detalhes do projeto…" value={draft.notes} onChange={(event) => update("notes", event.target.value)} />
      </section>
      <section className="ds-modal-section" aria-labelledby="ds-project-preferences">
        <Heading as="h3" id="ds-project-preferences" icon={<SlidersHorizontalIcon />}>Preferências</Heading>
        <div className="ds-modal-grid">
          <Checkbox label="Solicitar revisão" description="Marcar o projeto para revisão da equipe." checked={draft.review} onChange={(event) => update("review", event.target.checked)} />
          <Switch label="Receber atualizações" description="Acompanhar as mudanças do projeto." checked={draft.notifications} onChange={(event) => update("notifications", event.target.checked)} />
        </div>
      </section>
      <section className="ds-modal-section" aria-labelledby="ds-project-files">
        <Heading as="h3" id="ds-project-files" icon={<PaperclipIcon />}>Documentos do projeto</Heading>
        <FileDropzone label="Anexos" value={draft.files} onChange={(value) => update("files", value)} />
        <p className="ds-demo-note">Os arquivos ficam somente neste exemplo e não são enviados.</p>
      </section>
    </form>
  </Dialog>;
}
