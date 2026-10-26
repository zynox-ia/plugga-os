"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  papelDoAcesso,
  type Acesso,
  type Departamento as DepartamentoId,
  type EscopoDaEquipe,
  type ListaDaEquipe,
  type MembroDaEquipe,
  type NivelDeDepartamento,
  type UserStatus,
} from "@plugga/shared";

import { ShellCard, ShellTable } from "../components/plugga-shell";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DropdownMenu,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconEdit,
  IconEye,
  IconPlus,
  IconReset,
  IconSave,
  IconSearch,
  IconTrash,
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

const NIVEL_LABEL: Record<NivelDeDepartamento, string> = { membro: "Membro", gerente: "Gerente" };

const ITENS_POR_PAGINA = 7;

function departamentoLabel(departamento: DepartamentoId): string {
  return DEPARTAMENTOS.find((entrada) => entrada.id === departamento)?.label ?? departamento;
}

/** Uma linha legível do que a pessoa alcança, para caber na tabela. */
function resumoAcesso(acesso: Acesso): string {
  if (acesso.plataforma !== null) return "Todos os departamentos";
  if (acesso.departamentos.length === 0) return "Sem acesso";
  return acesso.departamentos
    .map((entrada) => `${departamentoLabel(entrada.departamento)} (${NIVEL_LABEL[entrada.nivel].toLowerCase()})`)
    .join(", ");
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
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [membroVisualizado, setMembroVisualizado] = useState<MembroDaEquipe | null>(null);
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
        setErro(await mensagemDeErro(resposta));
        return;
      }
      setAviso(formulario.modo === "convite" ? "Convite enviado." : "Acesso atualizado.");
      setFormulario(null);
      await carregar();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function acaoNoMembro(membro: MembroDaEquipe, acao: "desativar" | "reenviar-convite") {
    if (
      acao === "desativar" &&
      !window.confirm(`Desativar ${membro.name}? A pessoa perde o acesso e as sessões abertas caem na hora.`)
    ) {
      return;
    }

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
            <h2>Equipe e acessos</h2>
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
                icon={<IconPlus />}
                disabled={salvando}
                onClick={() => setFormulario({ modo: "convite", nome: "", email: "", acesso: ACESSO_VAZIO })}
              >
                Novo acesso
              </Button>
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
                          onSelect: () => setFormulario({ modo: "edicao", membro, acesso: membro.acesso }),
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
          title={formulario.modo === "convite" ? "Novo acesso" : "Editar acesso"}
          description={
            formulario.modo === "convite" ? "Cadastre uma nova pessoa e defina o acesso inicial." : formulario.membro.email
          }
          icon={formulario.modo === "convite" ? <IconPlus /> : <IconEdit />}
          onClose={() => setFormulario(null)}
          size="larga"
          footer={
            <Button variant="primary" icon={<IconSave />} loading={salvando} onClick={() => void enviar()}>
              {formulario.modo === "convite" ? "Enviar convite" : "Salvar acesso"}
            </Button>
          }
        >
          {formulario.modo === "convite" ? (
            <div className="ui-field-grid">
              <TextField
                label="Nome"
                value={formulario.nome}
                required
                onChange={(evento) => setFormulario({ ...formulario, nome: evento.target.value })}
              />
              <TextField
                label="E-mail"
                type="email"
                value={formulario.email}
                required
                onChange={(evento) => setFormulario({ ...formulario, email: evento.target.value })}
              />
            </div>
          ) : null}
          <EditorDeAcesso
            escopo={escopo}
            valor={formulario.acesso}
            onChange={(acesso) => setFormulario({ ...formulario, acesso })}
          />
        </Dialog>
      ) : null}

      {membroVisualizado ? (
        <Dialog
          title={membroVisualizado.name}
          description={membroVisualizado.email}
          icon={<IconEye />}
          onClose={() => setMembroVisualizado(null)}
          size="media"
        >
          <dl className="membro-detalhes">
            <div>
              <dt>Situação</dt>
              <dd>
                <Badge tone={STATUS_TOM[membroVisualizado.status]}>{STATUS_LABEL[membroVisualizado.status]}</Badge>
              </dd>
            </div>
            <div>
              <dt>Papel</dt>
              <dd>{ROTULO_DO_PAPEL[papelDoAcesso(membroVisualizado.acesso)]}</dd>
            </div>
            <div>
              <dt>Acesso</dt>
              <dd>{resumoAcesso(membroVisualizado.acesso)}</dd>
            </div>
          </dl>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * Editor do acesso. Desenha só o que o escopo do servidor permite conceder: o
 * papel de plataforma só aparece para quem pode dá-lo, e o gerente vê apenas os
 * próprios departamentos, sem a opção de gerente.
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
  const podeGerente = escopo.papeisConcediveis.includes("gerente");
  const departamentos = DEPARTAMENTOS.filter((departamento) => escopo.departamentos.includes(departamento.id));

  function nivelDe(departamento: DepartamentoId): NivelDeDepartamento | null {
    return valor.departamentos.find((entrada) => entrada.departamento === departamento)?.nivel ?? null;
  }

  function defineDepartamento(departamento: DepartamentoId, nivel: NivelDeDepartamento | null) {
    const outros = valor.departamentos.filter((entrada) => entrada.departamento !== departamento);
    const proximos = nivel ? [...outros, { departamento, nivel }] : outros;
    // Ordem do catálogo, sempre: sem isto marcar e desmarcar faria o resumo
    // trocar de ordem sozinho, como se algo mais tivesse mudado.
    onChange({
      plataforma: null,
      departamentos: DEPARTAMENTOS.flatMap((entrada) => proximos.filter((item) => item.departamento === entrada.id)),
    });
  }

  return (
    <div className="acesso-editor">
      {podeAdmin || podeDesenvolvedor ? (
        <fieldset className="acesso-empresa">
          <legend className="eyebrow">Papel</legend>
          <div className="acesso-niveis">
            <Radio
              name="papel"
              label="Equipe"
              description="Membro ou gerente dos departamentos escolhidos abaixo."
              checked={valor.plataforma === null}
              onChange={() => onChange({ plataforma: null, departamentos: [] })}
            />
            <Radio
              name="papel"
              label="Admin"
              description="Controla todo o sistema, inclusive aprovar."
              checked={valor.plataforma === "admin"}
              onChange={() => onChange({ plataforma: "admin", departamentos: [] })}
            />
            {podeDesenvolvedor ? (
              <Radio
                name="papel"
                label="Desenvolvedor"
                description="Tudo do admin, mais logs, auditoria e telas técnicas."
                checked={valor.plataforma === "desenvolvedor"}
                onChange={() => onChange({ plataforma: "desenvolvedor", departamentos: [] })}
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {valor.plataforma === null ? (
        <fieldset className="acesso-empresa">
          <legend className="eyebrow">Departamentos</legend>
          {departamentos.map((departamento) => {
            const nivel = nivelDe(departamento.id);
            return (
              <div className="acesso-departamento" key={departamento.id}>
                <Checkbox
                  label={departamento.label}
                  checked={nivel !== null}
                  onChange={(evento) => defineDepartamento(departamento.id, evento.target.checked ? "membro" : null)}
                />
                {nivel !== null && podeGerente ? (
                  <div className="acesso-niveis acesso-niveis--aninhada" role="radiogroup" aria-label={`Nível em ${departamento.label}`}>
                    <Radio
                      name={`nivel-${departamento.id}`}
                      label="Membro"
                      description="Opera o departamento."
                      checked={nivel === "membro"}
                      onChange={() => defineDepartamento(departamento.id, "membro")}
                    />
                    <Radio
                      name={`nivel-${departamento.id}`}
                      label="Gerente"
                      description="Aprova e gere a equipe do departamento."
                      checked={nivel === "gerente"}
                      onChange={() => defineDepartamento(departamento.id, "gerente")}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ) : (
        <p className="card-note">
          {ROTULO_DO_PAPEL[valor.plataforma]} alcança todos os departamentos; não há departamento para escolher.
        </p>
      )}
    </div>
  );
}
