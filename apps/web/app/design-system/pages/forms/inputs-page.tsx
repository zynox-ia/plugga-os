"use client";

import { useState } from "react";
import { Alert, Button, DatePicker, TextField, TextareaField } from "../../../components/ui";
import { DocPage, DocSection, Playground, Usage } from "../../kit/doc";

export function InputsPage() {
  const [name, setName] = useState("Projeto de demonstração");
  const [validated, setValidated] = useState(false);
  const error = validated && !name.trim() ? "Informe o nome do projeto." : undefined;
  return <DocPage title="Campos de entrada" category="Formulários" description="Rótulo, entrada e texto de apoio formam uma unidade. O mesmo padrão acompanha campos de texto, busca, datas, valores e áreas de texto.">
    <DocSection title="Anatomia e validação" description="O rótulo permanece visível. Mensagens de erro explicam como corrigir a entrada.">
      <Playground title="Formulário de exemplo" preview={<form className="ds-stack" noValidate onSubmit={(event) => { event.preventDefault(); setValidated(true); }}>
        <div className="ds-two-columns"><TextField label="Nome do projeto" required value={name} onChange={(event) => { setName(event.target.value); setValidated(false); }} error={error} hint="Use um nome fácil de reconhecer." /><TextField label="E-mail de contato" type="email" autoComplete="email" placeholder="nome@exemplo.com" hint="Exemplo de campo com formato de e-mail." /></div>
        <TextareaField label="Observações" placeholder="Adicione o contexto que a equipe precisa conhecer." maxLength={500} hint="Até 500 caracteres." />
        <div className="ds-row"><Button type="submit">Validar exemplo</Button>{validated && !error && <span role="status" className="ds-demo-note">Campos validados.</span>}</div>
      </form>} />
    </DocSection>
    <DocSection title="Tipos e estados" description="Campos desabilitados não recebem foco. Somente leitura permite consultar e copiar o valor.">
      <Playground title="Entradas disponíveis" preview={<div className="ds-two-columns">
        <TextField label="Busca" type="search" placeholder="Buscar pelo nome…" />
        <TextField label="Valor (R$)" type="number" min={0} step="0.01" prefix="R$" placeholder="0,00" />
        <DatePicker label="Data de vencimento" />
        <TextField label="Telefone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
        <TextField label="Somente leitura" value="DEMO-001" readOnly />
        <TextField label="Campo desabilitado" value="Indisponível neste exemplo" disabled />
        <TextField label="Campo com erro" defaultValue="valor inválido" error="Revise o valor informado." />
        <TextField label="Senha de exemplo" type="password" autoComplete="new-password" placeholder="Digite uma senha" />
      </div>} />
      <Alert title="Informação antes da entrada">Indique unidades e formatos no rótulo. O placeholder complementa o campo e nunca substitui seu nome.</Alert>
      <Usage>{'import { TextField, TextareaField } from "../components/ui";\n\n<TextField label="Nome do projeto" required\n  value={nome} onChange={(e) => setNome(e.target.value)}\n  hint="Use um nome fácil de reconhecer." error={erro} />\n<TextareaField label="Observações" maxLength={500} />'}</Usage>
    </DocSection>
  </DocPage>;
}
