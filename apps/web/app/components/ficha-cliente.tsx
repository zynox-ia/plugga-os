"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type { ClientContact, ClientDetail, ClientDuplicateCandidate, ClientOwner } from "@plugga/shared";

import {
  documentoFormatado,
  enderecoEmUmaLinha,
  enviar,
  hrefDaFicha,
  iniciais,
  PAPEIS,
  ROTULO_MOTIVO,
  ROTULO_ORIGEM,
  ROTULO_PAPEL,
  ROTULO_TIPO,
  telefoneFormatado,
  type ErroDoFormulario,
} from "../lib/clientes";
import { formatarData } from "../lib/format";
import { ClienteForm } from "./cliente-form";
import { StatusPill } from "./plugga-shell";

type Aba = "geral" | "contatos";

/**
 * Ficha do cliente (PLU-268): abre em modal por cima da lista, com endereço
 * próprio (`/clientes?cliente=<id>`). Abas desta entrega: Visão geral e
 * Contatos (só PJ). Negócios, UCs, histórico e arquivos entram nas próximas.
 */
export function FichaCliente({
  cliente: inicial,
  responsaveis,
  avisos,
  aoFechar,
}: {
  cliente: ClientDetail;
  responsaveis: ClientOwner[];
  avisos: ClientDuplicateCandidate[];
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [cliente, setCliente] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // A lista por trás é recarregada depois de cada mudança; a ficha acompanha.
  useEffect(() => setCliente(inicial), [inicial]);

  function atualizar(novo: ClientDetail) {
    setCliente(novo);
    setErro(null);
    router.refresh();
  }

  async function mudarSituacao() {
    setOcupado(true);
    const caminho = `/api/clientes/${cliente.id}/${cliente.active ? "inactivate" : "activate"}`;
    const resposta = await enviar<ClientDetail>(caminho, "POST", {});
    setOcupado(false);
    if (resposta.ok) atualizar(resposta.dados);
    else setErro(resposta.erro.mensagem);
  }

  const ehPj = cliente.personType === "pj";
  const documento = documentoFormatado(cliente.personType, cliente.document);
  const local = [cliente.city, cliente.state].filter(Boolean).join("/");
  const principal = cliente.contacts.find((c) => c.isPrimary) ?? cliente.contacts[0] ?? null;

  return (
    <>
      <div className="modal-topo">
        <div className="ficha-identidade">
          <span className="avatar-cliente" aria-hidden="true">
            {iniciais(cliente.name)}
          </span>
          <div>
            <h2>{cliente.name}</h2>
            <p className="ficha-sub">
              {[ROTULO_TIPO[cliente.personType], documento ? `${ehPj ? "CNPJ" : "CPF"} ${documento}` : "sem documento", local].filter(Boolean).join(" · ")}
            </p>
            <div className="row-actions" style={{ marginTop: 6 }}>
              <StatusPill variant={cliente.active ? "success" : "danger"}>{cliente.active ? "Ativo" : "Inativo"}</StatusPill>
              {cliente.owner ? <StatusPill>Responsável: {cliente.owner.name}</StatusPill> : null}
            </div>
          </div>
        </div>
        <div className="row-actions">
          {!editando ? (
            <button className="button button--secondary button--small" type="button" onClick={() => { setAba("geral"); setEditando(true); }}>
              Editar
            </button>
          ) : null}
          <button className="button button--secondary button--small" type="button" onClick={mudarSituacao} disabled={ocupado}>
            {cliente.active ? "Inativar" : "Reativar"}
          </button>
          <button className="botao-fechar" type="button" aria-label="Fechar ficha" onClick={aoFechar}>
            ✕
          </button>
        </div>
      </div>

      {editando ? null : (
        <div className="abas" role="tablist" aria-label="Seções da ficha">
          <button type="button" role="tab" id="aba-geral" aria-controls="painel-geral" aria-selected={aba === "geral"} onClick={() => setAba("geral")}>
            Visão geral
          </button>
          {ehPj ? (
            <button type="button" role="tab" id="aba-contatos" aria-controls="painel-contatos" aria-selected={aba === "contatos"} onClick={() => setAba("contatos")}>
              Contatos <span className="count-pill">{cliente.contacts.length}</span>
            </button>
          ) : null}
        </div>
      )}

      {editando ? (
        <ClienteForm
          modo="editar"
          cliente={cliente}
          responsaveis={responsaveis}
          aoCancelar={() => setEditando(false)}
          aoEditar={(novo) => {
            setEditando(false);
            atualizar(novo);
          }}
        />
      ) : (
        <div className="modal-corpo">
          {erro ? (
            <p className="aviso aviso--erro" role="alert">
              {erro}
            </p>
          ) : null}
          {avisos.length > 0 ? (
            <div className="aviso aviso--alerta" role="status">
              Cliente cadastrado. Confira se não é um destes:
              <ul>
                {avisos.map((candidato) => (
                  <li key={candidato.id}>
                    <Link href={hrefDaFicha(candidato.id)}>{candidato.name}</Link> · mesmo {candidato.matchedOn.map((m) => ROTULO_MOTIVO[m]).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {aba === "geral" ? (
            <section id="painel-geral" role="tabpanel" aria-labelledby="aba-geral" className="ficha-grade">
              <div className="ficha-caixa">
                <h3>Dados cadastrais</h3>
                <dl className="dados">
                  {ehPj ? (
                    <>
                      <dt>Razão social</dt>
                      <dd>{cliente.legalName ?? "—"}</dd>
                    </>
                  ) : null}
                  <dt>{ehPj ? "CNPJ" : "CPF"}</dt>
                  <dd>{documento ?? "—"}</dd>
                  <dt>Telefone</dt>
                  <dd>{telefoneFormatado(cliente.phone) ?? "—"}</dd>
                  <dt>E-mail</dt>
                  <dd>{cliente.email ?? "—"}</dd>
                  <dt>Endereço</dt>
                  <dd>{enderecoEmUmaLinha(cliente) ?? "—"}</dd>
                  <dt>Origem</dt>
                  <dd>{cliente.origin ? ROTULO_ORIGEM[cliente.origin] : "—"}</dd>
                  <dt>Cadastrado em</dt>
                  <dd>{formatarData(cliente.createdAt)}</dd>
                </dl>
                {cliente.notes ? <p className="ficha-nota">{cliente.notes}</p> : null}
              </div>

              {ehPj ? (
                <div className="ficha-caixa">
                  <h3>Contato principal</h3>
                  {principal ? (
                    <ResumoDoContato contato={principal} />
                  ) : (
                    <p className="ficha-vazio">
                      Nenhum contato cadastrado.{" "}
                      <button className="link-botao" type="button" onClick={() => setAba("contatos")}>
                        Adicionar contato
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="ficha-caixa">
                  <h3>Dados para contrato</h3>
                  {cliente.rg || cliente.rgIssuer || cliente.nationality || cliente.birthDate ? (
                    <dl className="dados">
                      <dt>RG</dt>
                      <dd>{[cliente.rg, cliente.rgIssuer].filter(Boolean).join(" · ") || "—"}</dd>
                      <dt>Nacionalidade</dt>
                      <dd>{cliente.nationality ?? "—"}</dd>
                      <dt>Nascimento</dt>
                      <dd>{cliente.birthDate ? cliente.birthDate.split("-").reverse().join("/") : "—"}</dd>
                    </dl>
                  ) : (
                    <p className="ficha-vazio">Não informados. Use Editar quando forem necessários para contrato ou procuração.</p>
                  )}
                </div>
              )}
            </section>
          ) : (
            <Contatos cliente={cliente} aoMudar={atualizar} />
          )}
        </div>
      )}
    </>
  );
}

function ResumoDoContato({ contato }: { contato: ClientContact }) {
  const funcao = [contato.role ? ROTULO_PAPEL[contato.role] : null, contato.jobTitle].filter(Boolean).join(" · ");
  return (
    <div className="contato-resumo">
      <strong>{contato.name}</strong>
      {funcao ? <span className="ficha-sub">{funcao}</span> : null}
      {contato.phone ? (
        <span>
          {telefoneFormatado(contato.phone)}
          {contato.phoneIsWhatsapp ? " · WhatsApp" : ""}
        </span>
      ) : null}
      {contato.email ? <span>{contato.email}</span> : null}
    </div>
  );
}

function Contatos({ cliente, aoMudar }: { cliente: ClientDetail; aoMudar: (cliente: ClientDetail) => void }) {
  const [editandoId, setEditandoId] = useState<string | "novo" | null>(cliente.contacts.length === 0 ? "novo" : null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(caminho: string, metodo: "PATCH" | "DELETE", corpo?: unknown) {
    const resposta = await enviar<ClientDetail>(caminho, metodo, corpo);
    if (!resposta.ok) return setErro(resposta.erro.mensagem);
    setErro(null);
    setRemovendoId(null);
    aoMudar(resposta.dados);
  }

  const base = `/api/clientes/${cliente.id}/contatos`;

  return (
    <section id="painel-contatos" role="tabpanel" aria-labelledby="aba-contatos">
      {erro ? (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="contatos-lista">
        {cliente.contacts.map((contato) =>
          editandoId === contato.id ? (
            <ContatoForm
              key={contato.id}
              clienteId={cliente.id}
              contato={contato}
              aoSalvar={(novo) => {
                setEditandoId(null);
                aoMudar(novo);
              }}
              aoCancelar={() => setEditandoId(null)}
            />
          ) : (
            <article key={contato.id} className="ficha-caixa contato-cartao" aria-label={`Contato ${contato.name}`}>
              <div className="row-actions" style={{ justifyContent: "space-between" }}>
                <ResumoDoContato contato={contato} />
                {contato.isPrimary ? <StatusPill variant="success">Principal</StatusPill> : null}
              </div>
              {contato.cpf || contato.rg ? (
                <span className="ficha-sub">
                  {[contato.cpf ? `CPF ${documentoFormatado("pf", contato.cpf)}` : null, contato.rg ? `RG ${contato.rg}` : null].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {removendoId === contato.id ? (
                <div className="row-actions">
                  <span>Remover {contato.name}?</span>
                  <button className="button button--small" type="button" onClick={() => executar(`${base}/${contato.id}`, "DELETE")}>
                    Remover
                  </button>
                  <button className="button button--secondary button--small" type="button" onClick={() => setRemovendoId(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="row-actions">
                  {!contato.isPrimary ? (
                    <button className="button button--secondary button--small" type="button" onClick={() => executar(`${base}/${contato.id}`, "PATCH", { isPrimary: true })}>
                      Tornar principal
                    </button>
                  ) : null}
                  <button className="button button--secondary button--small" type="button" onClick={() => setEditandoId(contato.id)}>
                    Editar
                  </button>
                  <button className="button button--secondary button--small" type="button" onClick={() => setRemovendoId(contato.id)}>
                    Remover
                  </button>
                </div>
              )}
            </article>
          ),
        )}
        {editandoId === "novo" ? (
          <ContatoForm
            clienteId={cliente.id}
            contato={null}
            aoSalvar={(novo) => {
              setEditandoId(null);
              aoMudar(novo);
            }}
            aoCancelar={() => setEditandoId(null)}
          />
        ) : (
          <button className="contato-novo" type="button" onClick={() => setEditandoId("novo")}>
            + Adicionar contato
          </button>
        )}
      </div>
    </section>
  );
}

function ContatoForm({
  clienteId,
  contato,
  aoSalvar,
  aoCancelar,
}: {
  clienteId: string;
  contato: ClientContact | null;
  aoSalvar: (cliente: ClientDetail) => void;
  aoCancelar: () => void;
}) {
  const [papel, setPapel] = useState(contato?.role ?? "");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const prefixo = `contato-${contato?.id ?? "novo"}`;

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(dados.get(campo) ?? "").trim();
    const representante = papel === "representante_legal";
    const corpo = {
      name: texto("name"),
      jobTitle: texto("jobTitle"),
      role: papel,
      phone: texto("phone"),
      phoneIsWhatsapp: dados.get("phoneIsWhatsapp") === "on",
      email: texto("email"),
      ...(contato ? {} : { isPrimary: dados.get("isPrimary") === "on" }),
      // CPF e RG só valem para o representante legal; em outro papel, são apagados.
      cpf: representante ? texto("cpf") : null,
      rg: representante ? texto("rg") : null,
    };
    setEnviando(true);
    const caminho = contato ? `/api/clientes/${clienteId}/contatos/${contato.id}` : `/api/clientes/${clienteId}/contatos`;
    const resposta = await enviar<ClientDetail>(caminho, contato ? "PATCH" : "POST", corpo);
    setEnviando(false);
    if (resposta.ok) aoSalvar(resposta.dados);
    else setErro(resposta.erro);
  }

  const campoErro = (campo: string) => erro?.porCampo[campo];

  return (
    <form className="ficha-caixa contato-cartao" onSubmit={salvar} noValidate aria-label={contato ? `Editar contato ${contato.name}` : "Novo contato"}>
      {erro ? (
        <p className="aviso aviso--erro" role="alert">
          {erro.mensagem}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={`${prefixo}-name`}>Nome do contato *</label>
        <input id={`${prefixo}-name`} name="name" required maxLength={150} defaultValue={contato?.name} />
        {campoErro("name") ? <span className="erro-campo">{campoErro("name")}</span> : null}
      </div>
      <div className="field">
        <label htmlFor={`${prefixo}-role`}>Papel</label>
        <select id={`${prefixo}-role`} name="role" value={papel} onChange={(e) => setPapel(e.target.value as typeof papel)}>
          <option value="">Não informado</option>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PAPEL[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${prefixo}-jobTitle`}>Cargo</label>
        <input id={`${prefixo}-jobTitle`} name="jobTitle" maxLength={100} defaultValue={contato?.jobTitle ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`${prefixo}-phone`}>Telefone do contato</label>
        <input id={`${prefixo}-phone`} name="phone" type="tel" maxLength={20} defaultValue={contato?.phone ?? ""} />
        {campoErro("phone") ? <span className="erro-campo">{campoErro("phone")}</span> : null}
      </div>
      <label className="caixa-marcar">
        <input type="checkbox" name="phoneIsWhatsapp" defaultChecked={contato?.phoneIsWhatsapp} /> É WhatsApp
      </label>
      <div className="field">
        <label htmlFor={`${prefixo}-email`}>E-mail do contato</label>
        <input id={`${prefixo}-email`} name="email" type="email" maxLength={254} defaultValue={contato?.email ?? ""} />
        {campoErro("email") ? <span className="erro-campo">{campoErro("email")}</span> : null}
      </div>
      {papel === "representante_legal" ? (
        <>
          <div className="field">
            <label htmlFor={`${prefixo}-cpf`}>CPF do representante</label>
            <input id={`${prefixo}-cpf`} name="cpf" inputMode="numeric" maxLength={14} defaultValue={contato?.cpf ?? ""} />
            {campoErro("cpf") ? <span className="erro-campo">{campoErro("cpf")}</span> : null}
          </div>
          <div className="field">
            <label htmlFor={`${prefixo}-rg`}>RG do representante</label>
            <input id={`${prefixo}-rg`} name="rg" maxLength={30} defaultValue={contato?.rg ?? ""} />
          </div>
        </>
      ) : null}
      {contato ? null : (
        <label className="caixa-marcar">
          <input type="checkbox" name="isPrimary" /> Contato principal
        </label>
      )}
      <div className="row-actions">
        <button className="button button--accent button--small" type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar contato"}
        </button>
        <button className="button button--secondary button--small" type="button" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
