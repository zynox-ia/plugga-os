"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  papelDoAcesso,
  type Acesso,
  type ListaDaEquipe,
  type MembroDaEquipe,
} from "@plugga/shared";

import { ShellCard, ShellTable } from "../components/plugga-shell";
import {
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  Heading,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconEdit,
  IconEye,
  IconReset,
  IconSave,
  IconSend,
  IconSearch,
  IconTrash,
  IconUser,
  IconUserPlus,
  TextField,
} from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { DetalhesDoMembro } from "./equipe-detalhes-do-membro";
import { EditorDeAcesso } from "./equipe-editor-de-acesso";
import { AvatarMembro, DepartamentosDaEquipe, PapelBadge } from "./equipe-partes";
import { STATUS_LABEL, STATUS_TOM } from "./equipe-rotulos";

/**
 * Equipe e acessos, no modelo de 4 papéis: membro ou gerente por departamento,
 * admin ou desenvolvedor na plataforma.
 *
 * O que aparece aqui é o que o servidor disse que a pessoa pode fazer
 * (`escopo`, `podeEditar`, `podeDesativar`, `podeReenviarConvite`). A tela não
 * recalcula a escada: se recalculasse, um dia mostraria um botão que a API
 * recusa — ou esconderia um que ela aceitaria.
 */

const ITENS_POR_PAGINA = 7;

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
        if (formulario.modo === "convite") await carregar();
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

  async function acaoNoMembro(membro: MembroDaEquipe, acao: "desativar" | "remover" | "reenviar-convite"): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/equipe/${membro.id}/${acao}`, { method: "POST" });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        return false;
      }
      setAviso(acao === "desativar" ? `${membro.name} foi desativado.` : acao === "remover" ? "Membro removido." : membro.status === "invited" ? "Convite reenviado." : "Link de acesso enviado.");
      setMembroVisualizado(null);
      await carregar();
      return true;
    } catch {
      setErro("Não foi possível falar com o servidor.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function copiarEmail(membro: MembroDaEquipe): Promise<void> {
    try {
      await navigator.clipboard.writeText(membro.email);
      setAviso(`E-mail de ${membro.name} copiado.`);
    } catch {
      setErro("Falha ao copiar o e-mail.");
    }
  }

  async function confirmarAcao(): Promise<void> {
    if (!membroParaConfirmar) return;
    const { membro, tipo } = membroParaConfirmar;
    if (await acaoNoMembro(membro, tipo)) setMembroParaConfirmar(null);
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
                          onSelect: () => void copiarEmail(membro),
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
                          onSelect: () => { setErro(null); setMembroParaConfirmar({ membro, tipo: "desativar" }); },
                        },
                        {
                          id: "remover",
                          label: "Remover membro",
                          icon: <IconTrash />,
                          danger: true,
                          disabled: !membro.podeRemover,
                          onSelect: () => { setErro(null); setMembroParaConfirmar({ membro, tipo: "remover" }); },
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
        <DetalhesDoMembro
          membro={membroVisualizado}
          onClose={() => setMembroVisualizado(null)}
          onEditar={(membro) => {
            setMembroVisualizado(null);
            setErroModal(null);
            setFormulario({ modo: "edicao", membro, acesso: membro.acesso });
          }}
          onCopiarEmail={copiarEmail}
        />
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
            {erro ? <p className="card-note auth-error">{erro}</p> : null}
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
