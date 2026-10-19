"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  problemasDoCadastro,
  somenteDigitos,
  type ClientDetail,
  type ClientDuplicateCandidate,
  type ClientOwner,
  type ClientPersonType,
  type CreateClientResponse,
} from "@plugga/shared";

import {
  enviar,
  hrefDaFicha,
  ORIGENS,
  ROTULO_MOTIVO,
  ROTULO_ORIGEM,
  ROTULO_TIPO,
  UFS,
  type ErroDoFormulario,
} from "../lib/clientes";

type Propriedades =
  | { modo: "criar"; responsaveis: ClientOwner[]; aoCriar: (resposta: CreateClientResponse) => void; aoCancelar: () => void }
  | { modo: "editar"; cliente: ClientDetail; responsaveis: ClientOwner[]; aoEditar: (cliente: ClientDetail) => void; aoCancelar: () => void };

function Campo({ id, rotulo, erro, dica, inteira, children }: { id: string; rotulo: string; erro?: string; dica?: string; inteira?: boolean; children: ReactNode }) {
  return (
    <div className={`field${inteira ? " inteira" : ""}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {erro ? (
        <span className="erro-campo" id={`${id}-erro`}>
          {erro}
        </span>
      ) : dica ? (
        <span className="dica">{dica}</span>
      ) : null}
    </div>
  );
}

/**
 * Cadastro e edição de cliente (PLU-268). O tipo (PJ ou PF) decide os campos:
 * PJ tem razão social e contato principal; PF tem os dados para contrato.
 * Documento é opcional, mas único; telefone ou e-mail é obrigatório.
 */
export function ClienteForm(props: Propriedades) {
  const cliente = props.modo === "editar" ? props.cliente : null;
  const formulario = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<ClientPersonType>(cliente?.personType ?? "pj");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [documentoRepetido, setDocumentoRepetido] = useState<ClientDuplicateCandidate | null>(null);
  const [avisos, setAvisos] = useState<ClientDuplicateCandidate[]>([]);

  const id = (campo: string) => `cliente-${props.modo}-${campo}`;
  const erroDo = (campo: string) => erro?.porCampo[campo];
  const invalido = (campo: string) => (erroDo(campo) ? { "aria-invalid": true, "aria-describedby": `${id(campo)}-erro` } : {});

  function valor(campo: string): string {
    const elemento = formulario.current?.elements.namedItem(campo) as HTMLInputElement | null;
    return elemento?.value.trim() ?? "";
  }

  async function procurarDuplicatas(parametros: Record<string, string>): Promise<ClientDuplicateCandidate[]> {
    const consulta = new URLSearchParams(Object.entries(parametros).filter(([, v]) => v));
    if ([...consulta.keys()].length === 0) return [];
    if (cliente) consulta.set("excludeId", cliente.id);
    const resposta = await enviar<{ candidates: ClientDuplicateCandidate[] }>(`/api/clientes/duplicados?${consulta}`, "GET");
    return resposta.ok ? resposta.dados.candidates : [];
  }

  async function conferirDocumento() {
    const digitos = somenteDigitos(valor("document"));
    if (digitos.length !== 11 && digitos.length !== 14) {
      setDocumentoRepetido(null);
      return;
    }
    const candidatos = await procurarDuplicatas({ document: digitos });
    setDocumentoRepetido(candidatos.find((c) => c.matchedOn.includes("document")) ?? null);
  }

  async function conferirContato() {
    const candidatos = await procurarDuplicatas({ name: valor("name"), phone: valor("phone"), email: valor("email") });
    setAvisos(candidatos.filter((c) => !c.matchedOn.includes("document")));
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(dados.get(campo) ?? "").trim();
    const editando = props.modo === "editar";

    // Campo em branco vai como "" e a API grava nulo; na edição, os campos do outro tipo são apagados.
    const corpo: Record<string, unknown> = {
      personType: tipo,
      name: texto("name"),
      document: texto("document"),
      phone: texto("phone"),
      email: texto("email"),
      postalCode: texto("postalCode"),
      street: texto("street"),
      addressComplement: texto("addressComplement"),
      district: texto("district"),
      city: texto("city"),
      state: texto("state"),
      origin: texto("origin"),
      notes: texto("notes"),
    };
    if (tipo === "pj") corpo.legalName = texto("legalName");
    else if (editando) corpo.legalName = null;
    for (const campo of ["rg", "rgIssuer", "nationality", "birthDate"]) {
      if (tipo === "pf") corpo[campo] = texto(campo);
      else if (editando) corpo[campo] = null;
    }
    if (texto("ownerId")) corpo.ownerId = texto("ownerId");
    if (!editando && tipo === "pj" && texto("contatoNome")) {
      corpo.primaryContact = {
        name: texto("contatoNome"),
        jobTitle: texto("contatoCargo"),
        phone: texto("contatoTelefone"),
        phoneIsWhatsapp: dados.get("contatoWhatsapp") === "on",
        email: texto("contatoEmail"),
      };
    }

    // Mesma regra da API, para o vendedor ver o problema antes de enviar.
    const problemas = problemasDoCadastro({
      personType: tipo,
      document: somenteDigitos(texto("document")) || null,
      phone: texto("phone") || null,
      email: texto("email") || null,
      temContatos: editando ? (cliente?.contacts.length ?? 0) > 0 : false,
    });
    if (problemas.length > 0) {
      setErro({ mensagem: "Confira os campos destacados.", porCampo: Object.fromEntries(problemas.map((p) => [p.campo, p.problema])) });
      return;
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

  const responsaveis = [...props.responsaveis];
  if (cliente?.owner && !responsaveis.some((r) => r.id === cliente.owner?.id)) responsaveis.push(cliente.owner);
  const ehPj = tipo === "pj";

  return (
    <form ref={formulario} onSubmit={salvar} noValidate>
      <div className="modal-corpo">
        <div className="seletor-tipo" role="radiogroup" aria-label="Tipo de cliente">
          {(["pj", "pf"] as const).map((opcao) => (
            <button key={opcao} type="button" role="radio" aria-checked={tipo === opcao} onClick={() => setTipo(opcao)}>
              {ROTULO_TIPO[opcao]}
            </button>
          ))}
        </div>

        {erro ? (
          <p className="aviso aviso--erro" role="alert">
            {erro.mensagem}
          </p>
        ) : null}

        <div className="form-grade">
          <Campo id={id("name")} rotulo={ehPj ? "Nome *" : "Nome completo *"} erro={erroDo("name")} dica={ehPj ? "Como o cliente é conhecido." : undefined}>
            <input id={id("name")} name="name" required maxLength={150} defaultValue={cliente?.name} onBlur={conferirContato} {...invalido("name")} />
          </Campo>
          <Campo id={id("document")} rotulo={ehPj ? "CNPJ" : "CPF"} erro={erroDo("document")} dica="Opcional. Se informado, precisa ser válido e único.">
            <input
              id={id("document")}
              name="document"
              inputMode="numeric"
              maxLength={20}
              placeholder={ehPj ? "00.000.000/0000-00" : "000.000.000-00"}
              defaultValue={cliente?.document ?? ""}
              onBlur={conferirDocumento}
              {...invalido("document")}
            />
          </Campo>

          {documentoRepetido ? (
            <p className="aviso aviso--alerta inteira" role="status">
              Já existe um cliente com este {ehPj ? "CNPJ" : "CPF"}: <strong>{documentoRepetido.name}</strong>.{" "}
              <Link href={hrefDaFicha(documentoRepetido.id)}>Abrir a ficha</Link> em vez de criar outro.
            </p>
          ) : null}

          {ehPj ? (
            <Campo id={id("legalName")} rotulo="Razão social" erro={erroDo("legalName")} inteira>
              <input id={id("legalName")} name="legalName" maxLength={200} defaultValue={cliente?.legalName ?? ""} />
            </Campo>
          ) : null}

          <Campo id={id("phone")} rotulo="Telefone" erro={erroDo("phone")}>
            <input id={id("phone")} name="phone" type="tel" maxLength={20} placeholder="(92) 99999-9999" defaultValue={cliente?.phone ?? ""} onBlur={conferirContato} {...invalido("phone")} />
          </Campo>
          <Campo id={id("email")} rotulo="E-mail" erro={erroDo("email")}>
            <input id={id("email")} name="email" type="email" maxLength={254} defaultValue={cliente?.email ?? ""} onBlur={conferirContato} {...invalido("email")} />
          </Campo>
          <p className="dica inteira">Informe pelo menos um telefone ou e-mail.</p>

          {avisos.length > 0 ? (
            <div className="aviso aviso--alerta inteira" role="status">
              Possível cliente repetido (o cadastro não é bloqueado):
              <ul>
                {avisos.map((candidato) => (
                  <li key={candidato.id}>
                    <Link href={hrefDaFicha(candidato.id)}>{candidato.name}</Link> · mesmo {candidato.matchedOn.map((m) => ROTULO_MOTIVO[m]).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Campo id={id("ownerId")} rotulo="Responsável *" erro={erroDo("ownerId")}>
            <select id={id("ownerId")} name="ownerId" defaultValue={cliente?.owner?.id ?? ""}>
              {props.modo === "criar" ? <option value="">Você (quem cadastra)</option> : null}
              {responsaveis.map((responsavel) => (
                <option key={responsavel.id} value={responsavel.id}>
                  {responsavel.name}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={id("origin")} rotulo="Origem" erro={erroDo("origin")}>
            <select id={id("origin")} name="origin" defaultValue={cliente?.origin ?? ""}>
              <option value="">Não informada</option>
              {ORIGENS.map((origem) => (
                <option key={origem} value={origem}>
                  {ROTULO_ORIGEM[origem]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <p className="form-secao">Endereço</p>
        <div className="form-grade">
          <Campo id={id("postalCode")} rotulo="CEP" erro={erroDo("postalCode")}>
            <input id={id("postalCode")} name="postalCode" inputMode="numeric" maxLength={9} placeholder="69000-000" defaultValue={cliente?.postalCode ?? ""} {...invalido("postalCode")} />
          </Campo>
          <Campo id={id("street")} rotulo="Logradouro e número" erro={erroDo("street")}>
            <input id={id("street")} name="street" maxLength={200} defaultValue={cliente?.street ?? ""} />
          </Campo>
          <Campo id={id("addressComplement")} rotulo="Complemento" erro={erroDo("addressComplement")}>
            <input id={id("addressComplement")} name="addressComplement" maxLength={100} defaultValue={cliente?.addressComplement ?? ""} />
          </Campo>
          <Campo id={id("district")} rotulo="Bairro" erro={erroDo("district")}>
            <input id={id("district")} name="district" maxLength={100} defaultValue={cliente?.district ?? ""} />
          </Campo>
          <Campo id={id("city")} rotulo="Cidade" erro={erroDo("city")}>
            <input id={id("city")} name="city" maxLength={100} defaultValue={cliente?.city ?? ""} />
          </Campo>
          <Campo id={id("state")} rotulo="UF" erro={erroDo("state")}>
            <select id={id("state")} name="state" defaultValue={cliente?.state ?? ""}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {ehPj ? null : (
          <>
            <p className="form-secao">Dados para contrato (opcional)</p>
            <div className="form-grade">
              <Campo id={id("rg")} rotulo="RG" erro={erroDo("rg")}>
                <input id={id("rg")} name="rg" maxLength={30} defaultValue={cliente?.rg ?? ""} {...invalido("rg")} />
              </Campo>
              <Campo id={id("rgIssuer")} rotulo="Órgão expedidor / UF" erro={erroDo("rgIssuer")}>
                <input id={id("rgIssuer")} name="rgIssuer" maxLength={30} placeholder="SSP/AM" defaultValue={cliente?.rgIssuer ?? ""} />
              </Campo>
              <Campo id={id("nationality")} rotulo="Nacionalidade" erro={erroDo("nationality")}>
                <input id={id("nationality")} name="nationality" maxLength={60} defaultValue={cliente?.nationality ?? ""} />
              </Campo>
              <Campo id={id("birthDate")} rotulo="Data de nascimento" erro={erroDo("birthDate")}>
                <input id={id("birthDate")} name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={cliente?.birthDate ?? ""} {...invalido("birthDate")} />
              </Campo>
            </div>
          </>
        )}

        {ehPj && props.modo === "criar" ? (
          <>
            <p className="form-secao">Contato principal (opcional)</p>
            <div className="form-grade">
              <Campo id={id("contatoNome")} rotulo="Nome do contato">
                <input id={id("contatoNome")} name="contatoNome" maxLength={150} />
              </Campo>
              <Campo id={id("contatoCargo")} rotulo="Cargo">
                <input id={id("contatoCargo")} name="contatoCargo" maxLength={100} />
              </Campo>
              <Campo id={id("contatoTelefone")} rotulo="Celular">
                <input id={id("contatoTelefone")} name="contatoTelefone" type="tel" maxLength={20} />
              </Campo>
              <Campo id={id("contatoEmail")} rotulo="E-mail do contato">
                <input id={id("contatoEmail")} name="contatoEmail" type="email" maxLength={254} />
              </Campo>
              <label className="caixa-marcar inteira">
                <input type="checkbox" name="contatoWhatsapp" /> O celular é WhatsApp
              </label>
            </div>
          </>
        ) : null}

        <p className="form-secao">Observações</p>
        <Campo id={id("notes")} rotulo="Anotações sobre o cliente" erro={erroDo("notes")} inteira>
          <textarea id={id("notes")} name="notes" maxLength={2000} rows={3} defaultValue={cliente?.notes ?? ""} />
        </Campo>
      </div>

      <div className="modal-rodape">
        <button className="button button--secondary" type="button" onClick={props.aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button className="button button--accent" type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : props.modo === "criar" ? "Cadastrar cliente" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
