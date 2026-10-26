"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  papelDoAcesso,
  type Acesso,
  type Departamento as DepartamentoId,
  type EscopoDaEquipe,
  type ListaDaEquipe,
  type MembroDaEquipe,
  type NivelDeDepartamento,
  type PapelDaEquipe,
  type UserStatus,
} from "@plugga/shared";

import { ShellCard, ShellTable } from "../components/plugga-shell";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DropdownMenu,
  Heading,
  IconBriefcase,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconCode,
  IconCopy,
  IconEdit,
  IconEye,
  IconLayers,
  IconReset,
  IconSave,
  IconSend,
  IconSearch,
  IconShield,
  IconTrash,
  IconUser,
  IconUserPlus,
  Radio,
  TextField,
  type Tone,
} from "../components/ui";
import { DEPARTAMENTOS, ROTULO_DO_PAPEL } from "../lib/organizacao";

/**
 * Equipe e acessos, no modelo de 4 papéis: membro ou gerente por departamento,
 * admin ou desenvolvedor na plataforma.
 *
 * O que aparece aqui é o que o servidor disse que a pessoa pode fazer
 * (`escopo`, `podeEditar`, `podeDesativar`, `podeReenviarConvite`). A tela não
 * recalcula a escada: se recalculasse, um dia mostraria um botão que a API
 * recusa — ou esconderia um que ela aceitaria.
 */

const STATUS_LABEL: Record<UserStatus, string> = {
  invited: "Convidado",
  active: "Ativo",
  disabled: "Desativado",
};

const STATUS_TOM: Record<UserStatus, Tone> = {
  invited: "neutral",
  active: "success",
  disabled: "danger",
};

const NIVEL_LABEL: Record<NivelDeDepartamento, string> = { membro: "Membro", gerente: "Diretor" };

const DESCRICAO_DO_DEPARTAMENTO: Record<DepartamentoId, string> = {
  crm: "Funil de vendas, clientes, propostas comerciais e contratos.",
  "energia-opm": "Ciclos mensais, auditoria de faturas e migração no Mercado Livre.",
  "produto-tecnologia": "PluggaMob, infraestrutura de recargas e eletropostos.",
  financeiro: "Contas a pagar e receber, fluxo de caixa e conciliação bancária.",
  suprimentos: "Gestão de compras, estoque e homologação de fornecedores.",
  "engenharia-obras": "Projetos elétricos, ordens de serviço, usinas e campo.",
  marketing: "Campanhas, geração de leads, comunicação institucional e eventos.",
};

const PAPEL_DESCRICAO: Record<PapelDaEquipe, string> = {
  desenvolvedor: "Acesso irrestrito a todas as configurações técnicas, ferramentas de desenvolvimento e dados globais.",
  admin: "Acesso administrativo amplo a todos os departamentos, configurações da organização e equipe.",
  gerente: "Liderança e gestão dos departamentos atribuídos, com visualização gerencial e relatórios.",
  membro: "Acesso operacional restrito aos departamentos e telas específicas liberadas para a função.",
};

function formatarDataHora(iso: string): string {
  try {
    const data = new Date(iso);
    if (isNaN(data.getTime())) return iso;
    return data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const ITENS_POR_PAGINA = 7;

function departamentoLabel(departamento: DepartamentoId): string {
  return DEPARTAMENTOS.find((entrada) => entrada.id === departamento)?.label ?? departamento;
}

function departamentosDoAcesso(acesso: Acesso): DepartamentoId[] {
  return acesso.plataforma !== null
    ? DEPARTAMENTOS.map((departamento) => departamento.id)
    : acesso.departamentos.map((entrada) => entrada.departamento);
}

function DepartamentosDaEquipe({ acesso }: { acesso: Acesso }) {
  if (acesso.plataforma !== null) {
    return (
      <span className="equipe-departamento equipe-departamento--plataforma">
        <span className="equipe-dept-dot" aria-hidden="true" />
        Todos os departamentos
      </span>
    );
  }

  const departamentos = departamentosDoAcesso(acesso);
  if (departamentos.length === 0) {
    return <span className="equipe-departamentos-vazio">Sem departamento</span>;
  }

  return (
    <div className="equipe-departamentos">
      {departamentos.slice(0, 2).map((departamento) => (
        <span
          className={`equipe-departamento equipe-departamento--${departamento}`}
          key={departamento}
        >
          <span className="equipe-dept-dot" aria-hidden="true" />
          {departamentoLabel(departamento)}
        </span>
      ))}
      {departamentos.length > 2 ? (
        <span
          className="equipe-departamento-contador"
          title={departamentos.slice(2).map(departamentoLabel).join(", ")}
        >
          +{departamentos.length - 2}
        </span>
      ) : null}
    </div>
  );
}

function PapelBadge({ acesso }: { acesso: Acesso }) {
  const papel = papelDoAcesso(acesso);
  return (
    <div className={`equipe-papel equipe-papel--${papel}`}>
      <strong>
        <span className="equipe-papel-dot" aria-hidden="true" />
        {ROTULO_DO_PAPEL[papel]}
      </strong>
    </div>
  );
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function AvatarMembro({
  membro,
}: {
  membro: MembroDaEquipe & { avatarUrl?: string };
}) {
  const [erroImg, setErroImg] = useState(false);
  const initials = iniciais(membro.name);

  return (
    <div className="equipe-avatar-wrapper">
      {membro.avatarUrl && !erroImg ? (
        <img
          src={membro.avatarUrl}
          alt={membro.name}
          className="equipe-avatar-img"
          onError={() => setErroImg(true)}
        />
      ) : (
        <span className="equipe-avatar" aria-hidden="true">
          {initials}
        </span>
      )}
      <span
        className={`equipe-presence-dot status-${membro.status}`}
        title={`Situação: ${STATUS_LABEL[membro.status]}`}
      />
    </div>
  );
}

const ACESSO_VAZIO: Acesso = { plataforma: null, departamentos: [] };

type Formulario =
  | { modo: "convite"; nome: string; email: string; acesso: Acesso }
  | { modo: "edicao"; membro: MembroDaEquipe; acesso: Acesso };

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as {
      mensagem?: string;
      message?: string;
      detalhes?: Array<{ campo: string; problema: string }>;
    };
    if (corpo.detalhes?.length) {
      return corpo.detalhes.map((detalhe) => `${detalhe.campo}: ${detalhe.problema}`).join("; ");
    }
    return corpo.mensagem ?? corpo.message ?? `Falha (${resposta.status}).`;
  } catch {
    return `Falha (${resposta.status}).`;
  }
}

export function EquipeView({
  inicial,
  aoCarregar,
}: {
  inicial: ListaDaEquipe | null;
  aoCarregar?: (lista: ListaDaEquipe) => void;
}) {
  const [dados, setDados] = useState<ListaDaEquipe | null>(inicial);
  const [carregando, setCarregando] = useState(inicial === null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [membroVisualizado, setMembroVisualizado] = useState<MembroDaEquipe | null>(null);
  const [membroParaConfirmar, setMembroParaConfirmar] = useState<{
    membro: MembroDaEquipe;
    tipo: "desativar" | "remover";
  } | null>(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(async () => {
    setCarregando(true);

    try {
      const resposta = await fetch("/api/equipe", { cache: "no-store" });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        setDados(null);
        return;
      }
      setErro(null);
      const lista = (await resposta.json()) as ListaDaEquipe;
      setDados(lista);
      aoCarregar?.(lista);
    } catch {
      setErro("Não foi possível falar com o servidor.");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [aoCarregar]);

  // A página já entrega a lista; só busca aqui quando ela não veio (sem acesso
  // ou API indisponível), para a tela mostrar o erro com a mensagem da API.
  useEffect(() => {
    if (inicial === null) void carregar();
  }, [carregar, inicial]);

  useEffect(() => {
    setPagina(1);
  }, [busca]);

  const membrosFiltrados = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados.membros;
    return dados.membros.filter(
      (m) =>
        m.name.toLowerCase().includes(termo) ||
        m.email.toLowerCase().includes(termo)
    );
  }, [dados, busca]);

  const totalMembros = membrosFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalMembros / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioIndice = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const fimIndice = Math.min(inicioIndice + ITENS_POR_PAGINA, totalMembros);
  const membrosPaginados = useMemo(() => {
    return membrosFiltrados.slice(inicioIndice, fimIndice);
  }, [membrosFiltrados, inicioIndice, fimIndice]);

  async function enviar(): Promise<void> {
    if (!formulario) return;
    setSalvando(true);
    setErro(null);
    setErroModal(null);
    setAviso(null);

    const requisicao =
      formulario.modo === "convite"
        ? fetch("/api/equipe/convites", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: formulario.email, name: formulario.nome, acesso: formulario.acesso }),
          })
        : fetch(`/api/equipe/${formulario.membro.id}/acesso`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acesso: formulario.acesso }),
          });

    try {
      const resposta = await requisicao;
      if (!resposta.ok) {
        setErroModal(await mensagemDeErro(resposta));
        return;
      }
      setAviso(formulario.modo === "convite" ? "Convite enviado." : "Acesso atualizado.");
      setFormulario(null);
      await carregar();
    } catch {
      setErroModal("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function acaoNoMembro(membro: MembroDaEquipe, acao: "desativar" | "reenviar-convite") {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/equipe/${membro.id}/${acao}`, { method: "POST" });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        return;
      }
      setAviso(acao === "desativar" ? `${membro.name} foi desativado.` : "Convite reenviado.");
      await carregar();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarAcao(): Promise<void> {
    if (!membroParaConfirmar) return;
    const { membro } = membroParaConfirmar;
    setMembroParaConfirmar(null);
    await acaoNoMembro(membro, "desativar");
  }

  if (carregando && !dados) {
    return (
      <ShellCard className="panel-card">
        <p className="card-note">Carregando equipe…</p>
      </ShellCard>
    );
  }

  if (!dados) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Equipe</span>
            <h2>Sem acesso a esta área</h2>
          </div>
        </div>
        <p className="card-note">{erro ?? "Gerir equipe é do gerente de um departamento, do admin ou do desenvolvedor."}</p>
      </ShellCard>
    );
  }

  const escopo = dados.escopo;
  return (
    <div className="stack">
      <ShellCard className="table-card equipe-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Configurações</span>
            <h2>Equipe e Acessos</h2>
          </div>
          <div className="equipe-heading-actions">
            <div className="equipe-busca">
              <IconSearch className="equipe-busca-icon" />
              <input
                type="search"
                className="equipe-busca-input"
                placeholder="Filtrar por nome ou e-mail…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Filtrar pessoas da equipe"
              />
            </div>
            {escopo.podeConvidar ? (
              <Button
                variant="primary"
                icon={<IconUserPlus />}
                disabled={salvando}
                onClick={() => { setErroModal(null); setFormulario({ modo: "convite", nome: "", email: "", acesso: ACESSO_VAZIO }); }}
              >Novo Membro</Button>
            ) : null}
          </div>
        </div>

        {erro ? <p className="card-note auth-error">{erro}</p> : null}
        {aviso ? <p className="card-note auth-success">{aviso}</p> : null}

        <ShellTable caption="Pessoas com acesso ao sistema">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Papel</th>
              <th>Departamentos</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {membrosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  {busca.trim()
                    ? `Nenhuma pessoa encontrada para "${busca}".`
                    : "Nenhuma pessoa com acesso ao sistema."}
                </td>
              </tr>
            ) : null}
            {membrosPaginados.map((membro) => (
              <tr key={membro.id}>
                <td>
                  <div className="equipe-membro">
                    <AvatarMembro membro={membro} />
                    <div className="equipe-membro-info">
                      <strong className="equipe-membro-nome">{membro.name}</strong>
                      <span className="equipe-membro-email">{membro.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <PapelBadge acesso={membro.acesso} />
                </td>
                <td>
                  <DepartamentosDaEquipe acesso={membro.acesso} />
                </td>
                <td>
                  <Badge tone={STATUS_TOM[membro.status]}>{STATUS_LABEL[membro.status]}</Badge>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconEye />}
                      iconOnly
                      aria-label={`Ver detalhes de ${membro.name}`}
                      onClick={() => setMembroVisualizado(membro)}
                    />
                    <DropdownMenu
                      label={`Mais ações para ${membro.name}`}
                      variant="icon"
                      disabled={salvando}
                      items={[
                        {
                          id: "alterar-acesso",
                          label: "Mudar acesso",
                          icon: <IconEdit />,
                          disabled: !membro.podeEditar,
                          onSelect: () => {
                            setErroModal(null);
                            setFormulario({ modo: "edicao", membro, acesso: membro.acesso });
                          },
                        },
                        {
                          id: "copiar-email",
                          label: "Copiar e-mail",
                          icon: <IconCopy />,
                          onSelect: () => {
                            if (typeof navigator !== "undefined" && navigator.clipboard) {
                              void navigator.clipboard.writeText(membro.email);
                              setAviso(`E-mail de ${membro.name} copiado.`);
                            }
                          },
                        },
                        {
                          id: "enviar-link",
                          label: "Enviar link de acesso",
                          icon: <IconReset />,
                          disabled: !membro.podeReenviarConvite,
                          onSelect: () => void acaoNoMembro(membro, "reenviar-convite"),
                        },
                        {
                          id: "desativar",
                          label: "Desativar acesso",
                          icon: <IconTrash />,
                          danger: true,
                          disabled: !membro.podeDesativar,
                          onSelect: () => void acaoNoMembro(membro, "desativar"),
                        },
                        {
                          id: "remover",
                          label: "Remover membro",
                          icon: <IconTrash />,
                          danger: true,
                          disabled: true,
                          onSelect: () => undefined,
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </ShellTable>

        {totalMembros > 0 ? (
          <div className="equipe-paginacao" aria-label="Paginação da tabela de equipe">
            <div className="equipe-paginacao-info">
              Mostrando <strong>{inicioIndice + 1}–{fimIndice}</strong> de <strong>{totalMembros}</strong> {totalMembros === 1 ? "membro" : "membros"}
            </div>
            {totalPaginas > 1 ? (
              <div className="equipe-paginacao-controles">
                <button
                  type="button"
                  className="equipe-paginacao-btn"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >
                  <IconChevronLeft width={15} height={15} aria-hidden="true" />
                  <span>Anterior</span>
                </button>
                <div className="equipe-paginacao-paginas">
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`equipe-paginacao-num ${paginaAtual === num ? "equipe-paginacao-num--ativo" : ""}`}
                      onClick={() => setPagina(num)}
                      aria-label={`Ir para a página ${num}`}
                      aria-current={paginaAtual === num ? "page" : undefined}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="equipe-paginacao-btn"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  aria-label="Próxima página"
                >
                  <span>Próxima</span>
                  <IconChevronRight width={15} height={15} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </ShellCard>

      {formulario ? (
        <Dialog
          title={formulario.modo === "convite" ? "Novo Membro" : "Editar Acesso"}
          description={
            formulario.modo === "convite"
              ? "Cadastre uma nova pessoa e defina os acessos da conta."
              : formulario.membro.email
          }
          icon={formulario.modo === "convite" ? <IconUserPlus /> : <IconEdit />}
          onClose={() => {
            setFormulario(null);
            setErroModal(null);
          }}
          size="media"
          footer={
            <Button variant="primary" icon={formulario.modo === "convite" ? <IconSend /> : <IconSave />} loading={salvando} onClick={() => void enviar()}>
              {formulario.modo === "convite" ? "Enviar convite" : "Salvar acesso"}
            </Button>
          }
        >
          <div className="ui-dialog-form">
            {erroModal ? <p className="card-note auth-error">{erroModal}</p> : null}
            {formulario.modo === "convite" ? (
              <section className="ui-dialog-section">
                <div className="ui-dialog-section-header">
                  <Heading as="h3" icon={<IconUser />}>Dados da Pessoa</Heading>
                  <p className="ui-dialog-section-desc">
                    Identificação e e-mail corporativo para envio do convite de acesso.
                  </p>
                </div>
                <div className="ui-dialog-grid">
                  <TextField
                    label="Nome completo"
                    value={formulario.nome}
                    required
                    placeholder="Ex.: Ana Silva"
                    onChange={(evento) => setFormulario({ ...formulario, nome: evento.target.value })}
                  />
                  <TextField
                    label="E-mail corporativo"
                    type="email"
                    value={formulario.email}
                    required
                    placeholder="nome@empresa.com.br"
                    onChange={(evento) => setFormulario({ ...formulario, email: evento.target.value })}
                  />
                </div>
              </section>
            ) : null}
            <EditorDeAcesso
              escopo={escopo}
              valor={formulario.acesso}
              onChange={(acesso) => setFormulario({ ...formulario, acesso })}
            />
          </div>
        </Dialog>
      ) : null}

      {membroVisualizado ? (
        <Dialog
          title="Detalhes do Membro"
          description={membroVisualizado.email}
          icon={<IconEye />}
          onClose={() => setMembroVisualizado(null)}
          size="media"
          cancelText="Fechar"
          footer={
            membroVisualizado.podeEditar ? (
              <Button
                variant="secondary"
                icon={<IconEdit />}
                onClick={() => {
                  const m = membroVisualizado;
                  setMembroVisualizado(null);
                  setErroModal(null);
                  setFormulario({ modo: "edicao", membro: m, acesso: m.acesso });
                }}
              >
                Editar Acesso
              </Button>
            ) : null
          }
        >
          <div className="ui-dialog-form">
            {/* Seção 1: Dados Cadastrais */}
            <section className="ui-dialog-section">
              <div className="ui-dialog-section-header">
                <Heading as="h3" icon={<IconUser />}>Informações da Pessoa</Heading>
                <p className="ui-dialog-section-desc">
                  Dados de identificação, e-mail e status da conta corporativa.
                </p>
              </div>
              <div className="ui-view-grid">
                <div className="ui-view-field">
                  <span className="ui-view-label">Nome Completo</span>
                  <span className="ui-view-value">{membroVisualizado.name}</span>
                </div>
                <div className="ui-view-field">
                  <span className="ui-view-label">E-mail Corporativo</span>
                  <div className="ui-view-value-with-action">
                    <span className="ui-view-value">{membroVisualizado.email}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconCopy />}
                      iconOnly
                      aria-label={`Copiar e-mail de ${membroVisualizado.name}`}
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          void navigator.clipboard.writeText(membroVisualizado.email);
                          setAviso(`E-mail de ${membroVisualizado.name} copiado.`);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="ui-view-field">
                  <span className="ui-view-label">Situação da Conta</span>
                  <div className="ui-view-value">
                    <Badge tone={STATUS_TOM[membroVisualizado.status]}>
                      {STATUS_LABEL[membroVisualizado.status]}
                    </Badge>
                  </div>
                </div>
                <div className="ui-view-field">
                  <span className="ui-view-label">Data de Cadastro</span>
                  <span className="ui-view-value">{formatarDataHora(membroVisualizado.createdAt)}</span>
                </div>
              </div>
            </section>

            {/* Seção 2: Papel e Nível de Acesso */}
            {(() => {
              const papel = papelDoAcesso(membroVisualizado.acesso);
              return (
                <section className="ui-dialog-section">
                  <div className="ui-dialog-section-header">
                    <Heading as="h3" icon={<IconShield />}>Papel e Nível de Acesso</Heading>
                    <p className="ui-dialog-section-desc">
                      Nível hierárquico e alcance das permissões na plataforma.
                    </p>
                  </div>
                  <div className="ui-view-role-card">
                    <div className="ui-view-role-icon">
                      {papel === "desenvolvedor" && <IconCode width={20} height={20} aria-hidden="true" />}
                      {papel === "admin" && <IconShield width={20} height={20} aria-hidden="true" />}
                      {papel === "gerente" && <IconBriefcase width={20} height={20} aria-hidden="true" />}
                      {papel === "membro" && <IconUser width={20} height={20} aria-hidden="true" />}
                    </div>
                    <div className="ui-view-role-info">
                      <div className="ui-view-role-title">
                        <strong>{ROTULO_DO_PAPEL[papel]}</strong>
                        <span className="ui-view-role-pill">
                          {membroVisualizado.acesso.plataforma !== null ? "Acesso à Plataforma" : "Acesso por Departamento"}
                        </span>
                      </div>
                      <p className="ui-view-role-desc">{PAPEL_DESCRICAO[papel]}</p>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Seção 3: Departamentos e Telas Liberadas */}
            <section className="ui-dialog-section">
              <div className="ui-dialog-section-header">
                <Heading as="h3" icon={<IconLayers />}>Departamentos e Telas Liberadas</Heading>
                <p className="ui-dialog-section-desc">
                  Visão detalhada dos departamentos e telas internas que este membro pode acessar.
                </p>
              </div>

              {membroVisualizado.acesso.plataforma !== null ? (
                <>
                  <div className="ui-view-global-alert">
                    <IconShield className="ui-view-global-alert-icon" width={18} height={18} aria-hidden="true" />
                    <div>
                      <strong>Acesso Global Liberado:</strong> Como {ROTULO_DO_PAPEL[papelDoAcesso(membroVisualizado.acesso)]}, este membro possui acesso irrestrito a todos os {DEPARTAMENTOS.length} departamentos e todas as telas do sistema.
                    </div>
                  </div>
                  <div className="ui-view-depts-list">
                    {DEPARTAMENTOS.map((dept) => (
                      <div key={dept.id} className="ui-view-dept-card">
                        <div className="ui-view-dept-header">
                          <div className="ui-view-dept-title-group">
                            <span className={`equipe-departamento equipe-departamento--${dept.id}`}>
                              <span className="equipe-dept-dot" aria-hidden="true" />
                              {dept.label}
                            </span>
                            <Badge tone="success">Acesso Total</Badge>
                          </div>
                        </div>
                        <p className="ui-view-dept-desc">{DESCRICAO_DO_DEPARTAMENTO[dept.id]}</p>
                        <div className="ui-view-processos-group">
                          <span className="ui-view-processos-label">Telas Liberadas ({dept.processos.length})</span>
                          <div className="ui-view-tags">
                            {dept.processos.map((proc) => (
                              <span key={proc.label} className="ui-view-tag">
                                <IconCheck width={12} height={12} className="ui-view-tag-check" aria-hidden="true" />
                                <span>{proc.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : membroVisualizado.acesso.departamentos.length === 0 ? (
                <div className="ui-view-empty">
                  Nenhum departamento atribuído a este membro no momento.
                </div>
              ) : (
                (() => {
                  const deptosAtribuidos = membroVisualizado.acesso.departamentos;
                  const idsAtribuidos = new Set(deptosAtribuidos.map((d) => d.departamento));
                  const outrosDepartamentos = DEPARTAMENTOS.filter((d) => !idsAtribuidos.has(d.id));

                  return (
                    <>
                      <div className="ui-view-depts-list">
                        {deptosAtribuidos.map((entrada) => {
                          const deptInfo = DEPARTAMENTOS.find((d) => d.id === entrada.departamento);
                          if (!deptInfo) return null;
                          return (
                            <div key={deptInfo.id} className="ui-view-dept-card">
                              <div className="ui-view-dept-header">
                                <div className="ui-view-dept-title-group">
                                  <span className={`equipe-departamento equipe-departamento--${deptInfo.id}`}>
                                    <span className="equipe-dept-dot" aria-hidden="true" />
                                    {deptInfo.label}
                                  </span>
                                  <Badge tone={entrada.nivel === "gerente" ? "info" : "neutral"}>
                                    {NIVEL_LABEL[entrada.nivel]}
                                  </Badge>
                                </div>
                              </div>
                              <p className="ui-view-dept-desc">{DESCRICAO_DO_DEPARTAMENTO[deptInfo.id]}</p>
                              <div className="ui-view-processos-group">
                                <span className="ui-view-processos-label">Telas Liberadas ({deptInfo.processos.length})</span>
                                <div className="ui-view-tags">
                                  {deptInfo.processos.map((proc) => (
                                    <span key={proc.label} className="ui-view-tag">
                                      <IconCheck width={12} height={12} className="ui-view-tag-check" aria-hidden="true" />
                                      <span>{proc.label}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {outrosDepartamentos.length > 0 ? (
                        <div className="ui-view-unassigned-section">
                          <span className="ui-view-unassigned-title">
                            Departamentos sem acesso ({outrosDepartamentos.length}):
                          </span>
                          <div className="ui-view-unassigned-tags">
                            {outrosDepartamentos.map((d) => (
                              <span key={d.id} className="ui-view-unassigned-tag">
                                {d.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()
              )}
            </section>
          </div>
        </Dialog>
      ) : null}

      {membroParaConfirmar ? (
        <Dialog
          title={membroParaConfirmar.tipo === "desativar" ? "Desativar Acesso" : "Remover Membro"}
          description={membroParaConfirmar.membro.email}
          icon={<IconTrash />}
          variant="danger"
          size="estreita"
          cancelAutoFocus
          onClose={() => setMembroParaConfirmar(null)}
          footer={
            <Button
              variant="danger"
              icon={<IconTrash />}
              loading={salvando}
              onClick={() => void confirmarAcao()}
            >
              {membroParaConfirmar.tipo === "desativar" ? "Desativar Acesso" : "Remover Membro"}
            </Button>
          }
        >
          <div className="ui-confirm-box">
            <p className="ui-confirm-message">
              Tem certeza de que deseja {membroParaConfirmar.tipo === "desativar" ? "desativar o acesso de" : "remover"} <strong>{membroParaConfirmar.membro.name}</strong>?
            </p>
            <div className="ui-confirm-alert">
              A pessoa perderá o acesso ao sistema imediatamente e todas as sessões abertas serão encerradas no mesmo instante.
            </div>
            <div className="ui-confirm-details">
              <div className="ui-confirm-row">
                <span className="ui-confirm-label">Pessoa:</span>
                <span className="ui-confirm-value">{membroParaConfirmar.membro.name}</span>
              </div>
              <div className="ui-confirm-row">
                <span className="ui-confirm-label">E-mail:</span>
                <span className="ui-confirm-value">{membroParaConfirmar.membro.email}</span>
              </div>
              <div className="ui-confirm-row">
                <span className="ui-confirm-label">Papel atual:</span>
                <span className="ui-confirm-value">{ROTULO_DO_PAPEL[papelDoAcesso(membroParaConfirmar.membro.acesso)]}</span>
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * Editor do acesso. Desenha os papéis permitidos pelo escopo (Membro, Diretor, Admin, DEV),
 * e para quem é de departamento permite selecionar os departamentos e expandir suas telas internas (processos).
 */
function EditorDeAcesso({
  escopo,
  valor,
  onChange,
}: {
  escopo: EscopoDaEquipe;
  valor: Acesso;
  onChange: (proximo: Acesso) => void;
}) {
  const podeAdmin = escopo.papeisConcediveis.includes("admin");
  const podeDesenvolvedor = escopo.papeisConcediveis.includes("desenvolvedor");
  const podeDiretor = escopo.papeisConcediveis.includes("gerente");
  const departamentos = DEPARTAMENTOS.filter((departamento) => escopo.departamentos.includes(departamento.id));

  const papelInicial =
    valor.plataforma === "desenvolvedor"
      ? "desenvolvedor"
      : valor.plataforma === "admin"
      ? "admin"
      : valor.departamentos.some((d) => d.nivel === "gerente")
      ? "diretor"
      : "membro";

  const [papelAtivo, setPapelAtivo] = useState<"membro" | "diretor" | "admin" | "desenvolvedor">(papelInicial);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => {
    return new Set(valor.departamentos.map((d) => d.departamento));
  });

  const [telasSelecionadas, setTelasSelecionadas] = useState<Record<string, string[]>>(() => {
    const mapa: Record<string, string[]> = {};
    for (const d of DEPARTAMENTOS) {
      mapa[d.id] = d.processos.map((p) => p.label);
    }
    return mapa;
  });

  function selecionarPapel(novoPapel: "membro" | "diretor" | "admin" | "desenvolvedor") {
    setPapelAtivo(novoPapel);
    if (novoPapel === "admin") {
      onChange({ plataforma: "admin", departamentos: [] });
    } else if (novoPapel === "desenvolvedor") {
      onChange({ plataforma: "desenvolvedor", departamentos: [] });
    } else if (novoPapel === "diretor") {
      onChange({
        plataforma: null,
        departamentos: valor.departamentos.map((d) => ({ ...d, nivel: "gerente" as const })),
      });
    } else {
      onChange({
        plataforma: null,
        departamentos: valor.departamentos.map((d) => ({ ...d, nivel: "membro" as const })),
      });
    }
  }

  function toggleExpansao(deptId: string) {
    setExpandidos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(deptId)) {
        proximo.delete(deptId);
      } else {
        proximo.add(deptId);
      }
      return proximo;
    });
  }

  function defineDepartamento(departamento: DepartamentoId, checked: boolean) {
    const outros = valor.departamentos.filter((entrada) => entrada.departamento !== departamento);
    const nivel: NivelDeDepartamento = papelAtivo === "diretor" ? "gerente" : "membro";
    const proximos = checked ? [...outros, { departamento, nivel }] : outros;

    if (checked) {
      setExpandidos((prev) => new Set([...prev, departamento]));
    } else {
      setExpandidos((prev) => {
        const proximo = new Set(prev);
        proximo.delete(departamento);
        return proximo;
      });
    }

    onChange({
      plataforma: null,
      departamentos: DEPARTAMENTOS.flatMap((entrada) => proximos.filter((item) => item.departamento === entrada.id)),
    });
  }

  function toggleTela(deptId: string, telaLabel: string, checked: boolean) {
    setTelasSelecionadas((prev) => {
      const atuais = prev[deptId] ?? DEPARTAMENTOS.find((d) => d.id === deptId)?.processos.map((p) => p.label) ?? [];
      const proximas = checked ? [...atuais, telaLabel] : atuais.filter((l) => l !== telaLabel);
      return { ...prev, [deptId]: proximas };
    });
  }

  function marcarTodasTelas(deptId: string) {
    const todos = DEPARTAMENTOS.find((d) => d.id === deptId)?.processos.map((p) => p.label) ?? [];
    setTelasSelecionadas((prev) => ({ ...prev, [deptId]: todos }));
  }

  function desmarcarTodasTelas(deptId: string) {
    setTelasSelecionadas((prev) => ({ ...prev, [deptId]: [] }));
  }

  const isPapelEquipe = papelAtivo === "membro" || papelAtivo === "diretor";

  return (
    <>
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header">
          <Heading as="h3" icon={<IconShield />}>Tipo de Papel</Heading>
          <p className="ui-dialog-section-desc">
            Escolha se o acesso é restrito aos departamentos e telas ou se abrange toda a plataforma.
          </p>
        </div>
        <div className="ui-role-cards" role="radiogroup" aria-label="Tipo de papel">
          {podeDesenvolvedor ? (
            <div
              className={`ui-role-card ${papelAtivo === "desenvolvedor" ? "ui-role-card--active" : ""}`}
              onClick={() => selecionarPapel("desenvolvedor")}
            >
              <Radio
                name="papel"
                label="Desenvolvedor (DEV)"
                checked={papelAtivo === "desenvolvedor"}
                onChange={() => selecionarPapel("desenvolvedor")}
              />
              <IconCode className="ui-role-card-icon" aria-hidden="true" />
            </div>
          ) : null}
          {podeAdmin ? (
            <div
              className={`ui-role-card ${papelAtivo === "admin" ? "ui-role-card--active" : ""}`}
              onClick={() => selecionarPapel("admin")}
            >
              <Radio
                name="papel"
                label="Admin"
                checked={papelAtivo === "admin"}
                onChange={() => selecionarPapel("admin")}
              />
              <IconShield className="ui-role-card-icon" aria-hidden="true" />
            </div>
          ) : null}
          {podeDiretor ? (
            <div
              className={`ui-role-card ${papelAtivo === "diretor" ? "ui-role-card--active" : ""}`}
              onClick={() => selecionarPapel("diretor")}
            >
              <Radio
                name="papel"
                label="Diretor"
                checked={papelAtivo === "diretor"}
                onChange={() => selecionarPapel("diretor")}
              />
              <IconBriefcase className="ui-role-card-icon" aria-hidden="true" />
            </div>
          ) : null}
          <div
            className={`ui-role-card ${papelAtivo === "membro" ? "ui-role-card--active" : ""}`}
            onClick={() => selecionarPapel("membro")}
          >
            <Radio
              name="papel"
              label="Membro"
              checked={papelAtivo === "membro"}
              onChange={() => selecionarPapel("membro")}
            />
            <IconUser className="ui-role-card-icon" aria-hidden="true" />
          </div>
        </div>
      </section>

      {isPapelEquipe ? (
        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<IconLayers />}>Departamentos e Telas de Acesso</Heading>
            <p className="ui-dialog-section-desc">
              Marque os departamentos com acesso e personalize as telas internas liberadas.
            </p>
          </div>
          <div className="ui-dialog-table-wrap">
            <table className="ui-dialog-table" aria-label="Departamentos e permissões">
              <thead>
                <tr>
                  <th scope="col">Departamento</th>
                  <th scope="col" style={{ width: "160px", textAlign: "right", whiteSpace: "nowrap" }}>Telas Internas</th>
                </tr>
              </thead>
              <tbody>
                {departamentos.map((departamento) => {
                  const selecionado = valor.departamentos.some((entrada) => entrada.departamento === departamento.id);
                  const isExpandido = expandidos.has(departamento.id);
                  const totalTelas = departamento.processos.length;
                  const telasAtivas = (telasSelecionadas[departamento.id] ?? departamento.processos.map((p) => p.label)).length;

                  return (
                    <Fragment key={departamento.id}>
                      <tr className={selecionado ? (isExpandido ? "ui-dialog-table-row--expanded" : "ui-dialog-table-row--selected") : undefined}>
                        <td>
                          <div className="ui-dialog-table-dept">
                            <Checkbox
                              label={departamento.label}
                              description={DESCRICAO_DO_DEPARTAMENTO[departamento.id]}
                              checked={selecionado}
                              onChange={(evento) => defineDepartamento(departamento.id, evento.target.checked)}
                            />
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {selecionado ? (
                            <div className="ui-dept-telas-control">
                              <button
                                type="button"
                                className={`ui-dept-expand-btn ${isExpandido ? "ui-dept-expand-btn--active" : ""}`}
                                onClick={() => toggleExpansao(departamento.id)}
                                aria-expanded={isExpandido}
                                title={isExpandido ? "Recolher telas" : "Expandir telas"}
                              >
                                <span className="ui-dept-expand-count">
                                  {telasAtivas}/{totalTelas}
                                </span>
                                {isExpandido ? (
                                  <IconChevronUp width={14} height={14} aria-hidden="true" />
                                ) : (
                                  <IconChevronDown width={14} height={14} aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="ui-dialog-table-empty">Sem acesso</span>
                          )}
                        </td>
                      </tr>
                      {selecionado && isExpandido ? (
                        <tr className="ui-dialog-table-subrow" key={`${departamento.id}-telas`}>
                          <td colSpan={2}>
                            <div className="ui-dept-processos-box">
                              <div className="ui-dept-processos-header">
                                <span className="ui-dept-processos-title">
                                  Telas Internas de {departamento.label}:
                                </span>
                                <div className="ui-dept-processos-actions">
                                  <button
                                    type="button"
                                    onClick={() => marcarTodasTelas(departamento.id)}
                                  >
                                    Marcar todas
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={() => desmarcarTodasTelas(departamento.id)}
                                  >
                                    Desmarcar todas
                                  </button>
                                </div>
                              </div>
                              <div className="ui-dept-processos-grid">
                                {departamento.processos.map((processo) => {
                                  const marcado = (
                                    telasSelecionadas[departamento.id] ?? departamento.processos.map((p) => p.label)
                                  ).includes(processo.label);
                                  return (
                                    <div className="ui-processo-item" key={processo.label}>
                                      <Checkbox
                                        label={processo.label}
                                        checked={marcado}
                                        onChange={(e) =>
                                          toggleTela(departamento.id, processo.label, e.target.checked)
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="ui-dialog-section">
          <p className="card-note">
            {ROTULO_DO_PAPEL[valor.plataforma!]} alcança todos os departamentos e configurações; não há departamento para escolher.
          </p>
        </section>
      )}
    </>
  );
}
