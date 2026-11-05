"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  cnpjValido,
  cpfValido,
  problemasDoCadastro,
  somenteDigitos,
  type ClientDetail,
  type ClientDuplicateCandidate,
  type ClientOwner,
  type ClientPersonType,
  type CreateClientResponse,
} from "@plugga/shared";

import {
  documentoFormatado,
  enviar,
  hrefDaFicha,
  ORIGENS,
  ROTULO_MOTIVO,
  ROTULO_ORIGEM,
  ROTULO_TIPO,
  telefoneFormatado,
  type ErroDoFormulario,
} from "../lib/clientes";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Heading,
  IconBuilding,
  IconFileText,
  IconPhone,
  IconPlus,
  IconUser,
  IconUserPlus,
  SelectField,
  TextField,
  TextareaField,
} from "./ui";

import { ClienteFormEndereco, useEnderecoDoCliente } from "./cliente-form-endereco";

type Propriedades =
  | { modo: "criar"; responsaveis?: ClientOwner[]; aoCriar: (resposta: CreateClientResponse) => void; aoCancelar: () => void }
  | { modo: "editar"; cliente: ClientDetail; responsaveis?: ClientOwner[]; aoEditar: (cliente: ClientDetail) => void; aoCancelar: () => void };

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraDocumento(valor: string, tipo: "pf" | "pj"): string {
  const d = valor.replace(/\D/g, "");
  if (tipo === "pf") {
    const s = d.slice(0, 11);
    if (s.length <= 3) return s;
    if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`;
    if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
    return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  }
  const s = d.slice(0, 14);
  if (s.length <= 2) return s;
  if (s.length <= 5) return `${s.slice(0, 2)}.${s.slice(2)}`;
  if (s.length <= 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`;
  if (s.length <= 12) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8)}`;
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

/**
 * Cadastro e edição de cliente no CRM (PLU-268), padronizado no Design System oficial.
 */
export function ClienteForm(props: Propriedades) {
  const cliente = props.modo === "editar" ? props.cliente : null;
  const editando = props.modo === "editar";

  const [tipo, setTipo] = useState<ClientPersonType>(cliente?.personType ?? "pj");
  const ehPj = tipo === "pj";

  // Campos de identificação
  const [nome, setNome] = useState(cliente?.name ?? "");
  const [razaoSocial, setRazaoSocial] = useState(cliente?.legalName ?? "");
  const [documento, setDocumento] = useState(
    cliente ? (documentoFormatado(cliente.personType, cliente.document) ?? "") : "",
  );

  // Campos de contato e atendimento
  const [telefone, setTelefone] = useState(telefoneFormatado(cliente?.phone ?? null) ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [origem, setOrigem] = useState(cliente?.origin ?? "");

  // Campos de endereço e busca automática de CEP
  const endereco = useEnderecoDoCliente(cliente);
  const { cep, logradouro, complemento, bairro, cidade, uf } = endereco;

  // Campos de contrato (PF)
  const [rg, setRg] = useState(cliente?.rg ?? "");
  const [rgIssuer, setRgIssuer] = useState(cliente?.rgIssuer ?? "");
  const [nacionalidade, setNacionalidade] = useState(cliente?.nationality ?? "");
  const [dataNascimento, setDataNascimento] = useState(cliente?.birthDate ?? "");

  // Contato principal (PJ modo criar)
  const [contatoNome, setContatoNome] = useState("");
  const [contatoCargo, setContatoCargo] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");

  // Observações
  const [anotacoes, setAnotacoes] = useState(cliente?.notes ?? "");

  // Estados de controle e feedback
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [documentoRepetido, setDocumentoRepetido] = useState<ClientDuplicateCandidate | null>(null);
  const [avisos, setAvisos] = useState<ClientDuplicateCandidate[]>([]);

  const erroDo = (campo: string) => erro?.porCampo[campo];

  async function procurarDuplicatas(parametros: Record<string, string>): Promise<ClientDuplicateCandidate[]> {
    const consulta = new URLSearchParams(Object.entries(parametros).filter(([, v]) => v));
    if ([...consulta.keys()].length === 0) return [];
    if (cliente) consulta.set("excludeId", cliente.id);
    const resposta = await enviar<{ candidates: ClientDuplicateCandidate[] }>(`/api/clientes/duplicados?${consulta}`, "GET");
    return resposta.ok ? resposta.dados.candidates : [];
  }

  async function conferirDocumento() {
    const digitos = somenteDigitos(documento);
    if (digitos.length !== 11 && digitos.length !== 14) {
      setDocumentoRepetido(null);
      return;
    }
    const candidatos = await procurarDuplicatas({ document: digitos });
    setDocumentoRepetido(candidatos.find((c) => c.matchedOn.includes("document")) ?? null);
  }

  async function conferirContato() {
    const candidatos = await procurarDuplicatas({
      name: nome.trim(),
      phone: somenteDigitos(telefone),
      email: email.trim(),
    });
    setAvisos(candidatos.filter((c) => !c.matchedOn.includes("document")));
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const corpo: Record<string, unknown> = {
      personType: tipo,
      name: nome.trim(),
      document: somenteDigitos(documento) || null,
      phone: somenteDigitos(telefone) || null,
      email: email.trim() || null,
      postalCode: somenteDigitos(cep) || null,
      street: logradouro.trim() || null,
      addressComplement: complemento.trim() || null,
      district: bairro.trim() || null,
      city: cidade.trim() || null,
      state: uf || null,
      origin: origem || null,
      notes: anotacoes.trim() || null,
    };

    if (ehPj) {
      corpo.legalName = razaoSocial.trim() || null;
    } else if (editando) {
      corpo.legalName = null;
    }

    if (!ehPj) {
      corpo.rg = rg.trim() || null;
      corpo.rgIssuer = rgIssuer.trim() || null;
      corpo.nationality = nacionalidade.trim() || null;
      corpo.birthDate = dataNascimento || null;
    } else if (editando) {
      corpo.rg = null;
      corpo.rgIssuer = null;
      corpo.nationality = null;
      corpo.birthDate = null;
    }

    if (editando && cliente?.owner?.id) {
      corpo.ownerId = cliente.owner.id;
    }

    if (!editando && ehPj && contatoNome.trim()) {
      corpo.primaryContact = {
        name: contatoNome.trim(),
        jobTitle: contatoCargo.trim() || null,
        phone: somenteDigitos(contatoTelefone) || null,
        phoneIsWhatsapp: false,
        email: contatoEmail.trim() || null,
      };
    }

    // Validação preventiva no cliente
    const problemas = problemasDoCadastro({
      personType: tipo,
      document: somenteDigitos(documento) || null,
      phone: somenteDigitos(telefone) || null,
      email: email.trim() || null,
      temContatos: editando ? (cliente?.contacts.length ?? 0) > 0 : Boolean(contatoNome.trim()),
    });

    if (problemas.length > 0) {
      setErro({
        mensagem: "Confira os campos destacados.",
        porCampo: Object.fromEntries(problemas.map((p) => [p.campo, p.problema])),
      });
      return;
    }

    if (documento) {
      const docLimpo = somenteDigitos(documento);
      if (tipo === "pf" && !cpfValido(docLimpo)) {
        setErro({ mensagem: "Confira os campos destacados.", porCampo: { document: "CPF inválido." } });
        return;
      }
      if (tipo === "pj" && !cnpjValido(docLimpo)) {
        setErro({ mensagem: "Confira os campos destacados.", porCampo: { document: "CNPJ inválido." } });
        return;
      }
    }

    setEnviando(true);
    setErro(null);

    if (props.modo === "criar") {
      const resposta = await enviar<CreateClientResponse>("/api/clientes", "POST", corpo);
      setEnviando(false);
      if (resposta.ok) return props.aoCriar(resposta.dados);
      setErro(resposta.erro);
      if (resposta.erro.codigo === "CONFLITO_UNICIDADE") await conferirDocumento();
      return;
    }

    const resposta = await enviar<ClientDetail>(`/api/clientes/${props.cliente.id}`, "PATCH", corpo);
    setEnviando(false);
    if (resposta.ok) return props.aoEditar(resposta.dados);
    setErro(resposta.erro);
    if (resposta.erro.codigo === "CONFLITO_UNICIDADE") await conferirDocumento();
  }

  const formConteudo = (
    <div className="ui-dialog-form">
      {erro?.mensagem ? (
        <Alert tone="danger" title={erro.mensagem} />
      ) : null}

      {/* Seção 1: Identificação do Cliente */}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header">
          <div className="ui-dialog-section-header-row">
            <Heading as="h3" icon={<IconUser />}>Identificação do Cliente</Heading>
            <div className="seletor-tipo" role="radiogroup" aria-label="Tipo de cliente">
              {(["pf", "pj"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  role="radio"
                  aria-checked={tipo === opcao}
                  onClick={() => {
                    setTipo(opcao);
                    setDocumento(mascaraDocumento(documento, opcao));
                    setErro(null);
                  }}
                >
                  {opcao === "pf" ? (
                    <IconUser width={14} height={14} aria-hidden="true" />
                  ) : (
                    <IconBuilding width={14} height={14} aria-hidden="true" />
                  )}
                  <span>{ROTULO_TIPO[opcao]}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="ui-dialog-section-desc">
            Selecione o tipo de pessoa e informe os dados principais de identificação.
          </p>
        </div>

        <div className="ui-dialog-grid">
          <TextField
            id="cliente-nome"
            name="name"
            label={ehPj ? "Nome *" : "Nome completo *"}
            required
            maxLength={150}
            value={nome}
            placeholder={ehPj ? "Ex.: Solar Distribuidora" : "Ex.: Mariana Costa"}
            error={erroDo("name")}
            onChange={(ev) => setNome(ev.target.value)}
            onBlur={conferirContato}
          />
          <TextField
            id="cliente-documento"
            name="document"
            label={ehPj ? "CNPJ" : "CPF"}
            inputMode="numeric"
            maxLength={20}
            value={documento}
            placeholder={ehPj ? "00.000.000/0000-00" : "000.000.000-00"}
            error={erroDo("document")}
            onChange={(ev) => setDocumento(mascaraDocumento(ev.target.value, tipo))}
            onBlur={conferirDocumento}
          />
        </div>

        {documentoRepetido ? (
          <div>
            <Alert tone="warning" title={`Já existe um cliente com este ${ehPj ? "CNPJ" : "CPF"}: ${documentoRepetido.name}.`}>
              <Link href={hrefDaFicha(documentoRepetido.id)} style={{ fontWeight: 600, textDecoration: "underline" }}>
                Abrir a ficha
              </Link>{" "}
              em vez de criar outro.
            </Alert>
          </div>
        ) : null}

        {ehPj ? (
          <TextField
            id="cliente-razao-social"
            name="legalName"
            label="Razão social"
            maxLength={200}
            value={razaoSocial}
            placeholder="Ex.: Distribuidora de Equipamentos Solares Ltda."
            error={erroDo("legalName")}
            onChange={(ev) => setRazaoSocial(ev.target.value)}
          />
        ) : null}
      </section>

      {/* Seção 2: Contato e Atendimento */}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header">
          <Heading as="h3" icon={<IconPhone />}>Contato e Atendimento</Heading>
          <p className="ui-dialog-section-desc">
            Canais de comunicação direta e canal de captação do cliente.
          </p>
        </div>

        <div className="ui-dialog-grid">
          <TextField
            id="cliente-telefone"
            name="phone"
            label="Telefone"
            type="tel"
            maxLength={20}
            value={telefone}
            placeholder="(92) 99999-9999"
            error={erroDo("phone")}
            onChange={(ev) => setTelefone(mascaraTelefone(ev.target.value))}
            onBlur={conferirContato}
          />
          <TextField
            id="cliente-email"
            name="email"
            label="E-mail"
            type="email"
            maxLength={254}
            value={email}
            placeholder="contato@empresa.com.br"
            error={erroDo("email")}
            onChange={(ev) => setEmail(ev.target.value)}
            onBlur={conferirContato}
          />
        </div>

        {avisos.length > 0 ? (
          <div>
            <Alert tone="warning" title="Possível cliente repetido (o cadastro não é bloqueado):">
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                {avisos.map((candidato) => (
                  <li key={candidato.id}>
                    <Link href={hrefDaFicha(candidato.id)} style={{ fontWeight: 600, textDecoration: "underline" }}>
                      {candidato.name}
                    </Link>{" "}
                    · mesmo {candidato.matchedOn.map((m) => ROTULO_MOTIVO[m]).join(", ")}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        <SelectField
          id="cliente-origem"
          label="Origem"
          value={origem}
          onChange={setOrigem}
          options={[
            { value: "", label: "Não informada" },
            ...ORIGENS.map((o) => ({ value: o, label: ROTULO_ORIGEM[o] })),
          ]}
        />
      </section>

      {/* Seção 3: Contato Principal (Apenas PJ na criação) */}
      {ehPj && !editando ? (
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconUserPlus />}>Contato Principal</Heading>
            <p className="ui-dialog-section-desc">
              Pessoa física responsável pelo contato direto nesta empresa.
            </p>
          </div>
          <div className="ui-dialog-grid">
            <TextField
              id="cliente-contatoNome"
              name="contatoNome"
              label="Nome do contato"
              maxLength={150}
              value={contatoNome}
              placeholder="Ex.: Juliana Prado"
              onChange={(ev) => setContatoNome(ev.target.value)}
            />
            <TextField
              id="cliente-contatoCargo"
              name="contatoCargo"
              label="Cargo"
              maxLength={100}
              value={contatoCargo}
              placeholder="Ex.: Diretora Comercial"
              onChange={(ev) => setContatoCargo(ev.target.value)}
            />
          </div>
          <div className="ui-dialog-grid">
            <TextField
              id="cliente-contatoTelefone"
              name="contatoTelefone"
              label="Telefone do contato"
              type="tel"
              maxLength={20}
              value={contatoTelefone}
              placeholder="(92) 99999-9999"
              onChange={(ev) => setContatoTelefone(mascaraTelefone(ev.target.value))}
            />
            <TextField
              id="cliente-contatoEmail"
              name="contatoEmail"
              label="E-mail do contato"
              type="email"
              maxLength={254}
              value={contatoEmail}
              placeholder="juliana@empresa.com.br"
              onChange={(ev) => setContatoEmail(ev.target.value)}
            />
          </div>
        </section>
      ) : null}

      <ClienteFormEndereco endereco={endereco} erroDo={erroDo} />

      {/* Seção 5: Dados para Contrato (Apenas PF) */}
      {!ehPj ? (
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconFileText />}>Dados para Contrato (opcional)</Heading>
            <p className="ui-dialog-section-desc">
              Informações civis complementares para formalização de propostas e contratos.
            </p>
          </div>
          <div className="ui-dialog-grid">
            <TextField
              id="cliente-rg"
              name="rg"
              label="RG"
              maxLength={30}
              value={rg}
              placeholder="Número do documento"
              error={erroDo("rg")}
              onChange={(ev) => setRg(ev.target.value)}
            />
            <TextField
              id="cliente-rgIssuer"
              name="rgIssuer"
              label="Órgão expedidor / UF"
              maxLength={30}
              value={rgIssuer}
              placeholder="Ex.: SSP/AM"
              error={erroDo("rgIssuer")}
              onChange={(ev) => setRgIssuer(ev.target.value)}
            />
          </div>
          <div className="ui-dialog-grid">
            <TextField
              id="cliente-nationality"
              name="nationality"
              label="Nacionalidade"
              maxLength={60}
              value={nacionalidade}
              placeholder="Ex.: Brasileira"
              error={erroDo("nationality")}
              onChange={(ev) => setNacionalidade(ev.target.value)}
            />
            <DatePicker
              label="Data de nascimento"
              value={dataNascimento}
              name="birthDate"
              max={new Date().toISOString().slice(0, 10)}
              error={erroDo("birthDate")}
              onChange={setDataNascimento}
            />
          </div>
        </section>
      ) : null}

      {/* Seção 6: Observações */}
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header">
          <Heading as="h3" icon={<IconFileText />}>Observações</Heading>
          <p className="ui-dialog-section-desc">
            Anotações internas sobre o perfil ou histórico do cliente.
          </p>
        </div>
        <TextareaField
          id="cliente-notes"
          name="notes"
          aria-label="Anotações sobre o cliente"
          maxLength={2000}
          rows={3}
          value={anotacoes}
          placeholder="Registre aqui informações adicionais de interesse..."
          error={erroDo("notes")}
          onChange={(ev) => setAnotacoes(ev.target.value)}
        />
      </section>
    </div>
  );

  // No modo de edição (dentro da Ficha), renderiza diretamente o formulário estilizado
  if (editando) {
    return (
      <form onSubmit={salvar} noValidate style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {formConteudo}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--ui-divider)" }}>
          <Button variant="secondary" type="button" onClick={props.aoCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={enviando}>
            Salvar alterações
          </Button>
        </div>
      </form>
    );
  }

  // No modo de criação, renderiza o modal completo com Dialog
  return (
    <Dialog
      title="Novo Cliente"
      accessibleLabel="Novo cliente"
      description="Cadastre um novo cliente no CRM com dados de contato, atendimento e endereço."
      icon={<IconUserPlus />}
      onClose={props.aoCancelar}
      size="media"
      footer={
        <Button
          variant="primary"
          icon={<IconPlus />}
          loading={enviando}
          type="submit"
          form="form-cliente-criar"
        >
          Cadastrar cliente
        </Button>
      }
    >
      <form id="form-cliente-criar" onSubmit={salvar} noValidate>
        {formConteudo}
      </form>
    </Dialog>
  );
}
