"use client";

import { useCallback, useEffect, useState } from "react";
import {
  companyKeys,
  type CompanyKey,
  type DepartmentId,
  type TeamListResponse,
  type TeamMember,
  type TeamScope,
  type UserAccess,
  type UserStatus,
} from "@plugga/shared";

import { ShellCard, ShellTable } from "../components/plugga-shell";
import {
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  IconEdit,
  IconEye,
  IconPlus,
  IconReset,
  IconSave,
  IconTrash,
  TextField,
  type Tone,
} from "../components/ui";
import { EMPRESAS_POR_ID } from "../lib/organizacao";

/**
 * Equipe e acessos.
 *
 * Uma tela só para acompanhar quem já tem acesso e o que alcança.
 *
 * O que aparece aqui é o que o servidor disse que a pessoa pode fazer
 * (`scope`, `canManage`, `canDeactivate`). A tela não recalcula a regra de
 * escopo: se recalculasse, um dia mostraria um botão que a API recusa — ou
 * esconderia um que ela aceitaria.
 */

const PAPEL_LABEL: Record<string, string> = {
  admin: "Administração da plataforma",
  diretoria: "Diretoria",
  comercial: "Comercial",
  pluggamob: "PluggaMob",
  financeiro: "Financeiro",
  compras: "Compras",
  opm: "OPM",
  tech: "Tecnologia",
  viewer: "Leitura",
  projetista: "Projetista",
  engenheiro: "Engenheiro",
  supervisor: "Supervisor de obra",
  tecnico: "Técnico de campo",
  almoxarife: "Almoxarife",
  seguranca: "Segurança do trabalho",
  gestor_suprimentos: "Gestor de Suprimentos",
  comprador: "Comprador",
};

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

function departamentoLabel(empresa: CompanyKey, departamento: DepartmentId): string {
  return (
    EMPRESAS_POR_ID[empresa].departamentos.find((entrada) => entrada.id === departamento)?.label ??
    departamento
  );
}

/** Uma linha legível do que a pessoa alcança, para caber na tabela. */
function resumoAcesso(acesso: UserAccess): string {
  const partes = acesso.platformRoles.map((papel) => PAPEL_LABEL[papel] ?? papel);

  for (const empresa of acesso.companies) {
    const papeis = empresa.roles.map((papel) => PAPEL_LABEL[papel] ?? papel).join(", ");
    const departamentos = empresa.departments
      .map(
        (departamento) =>
          departamentoLabel(empresa.companyId, departamento.departmentId) +
          (departamento.isManager ? " (gestor)" : ""),
      )
      .join(", ");

    partes.push(
      `${EMPRESAS_POR_ID[empresa.companyId].nome} · ${papeis}` +
        (departamentos ? ` · ${departamentos}` : " · sem departamento"),
    );
  }

  return partes.length > 0 ? partes.join(" | ") : "Sem acesso";
}

function tituloAcesso(acesso: UserAccess): string {
  if (acesso.platformRoles.includes("admin")) return "Administração da plataforma";

  const papeis = acesso.companies.flatMap((empresa) => empresa.roles);
  return papeis.length > 0
    ? [...new Set(papeis)].map((papel) => PAPEL_LABEL[papel] ?? papel).join(" · ")
    : "Acesso personalizado";
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

const ACESSO_VAZIO: UserAccess = { platformRoles: [], companies: [] };

type Formulario =
  | { modo: "convite"; nome: string; email: string; acesso: UserAccess }
  | { modo: "edicao"; membro: TeamMember; acesso: UserAccess };

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as {
      message?: string;
      issues?: Array<{ path: string; message: string }>;
    };
    if (corpo.issues?.length) {
      return corpo.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    }
    return corpo.message ?? `Falha (${resposta.status}).`;
  } catch {
    return `Falha (${resposta.status}).`;
  }
}

export function EquipeView() {
  const [dados, setDados] = useState<TeamListResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [membroVisualizado, setMembroVisualizado] = useState<TeamMember | null>(null);
  const carregar = useCallback(async () => {
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/users", {
        cache: "no-store",
      });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        setDados(null);
        return;
      }
      setErro(null);
      setDados((await resposta.json()) as TeamListResponse);
    } catch {
      setErro("Não foi possível falar com o servidor.");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(): Promise<void> {
    if (!formulario) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);

    const requisicao = formulario.modo === "convite"
      ? fetch("/api/auth/invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: formulario.email,
            name: formulario.nome,
            access: formulario.acesso,
          }),
        })
      : fetch(`/api/auth/users/${formulario.membro.id}/access`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access: formulario.acesso }),
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

  async function acaoNoMembro(membro: TeamMember, acao: "deactivate" | "resend-invite") {
    if (
      acao === "deactivate" &&
      !window.confirm(
        `Desativar ${membro.name}? A pessoa perde o acesso e as sessões abertas caem na hora.`,
      )
    ) {
      return;
    }

    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch(`/api/auth/users/${membro.id}/${acao}`, { method: "POST" });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta));
        return;
      }
      setAviso(acao === "deactivate" ? `${membro.name} foi desativado.` : "Convite reenviado.");
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
        <p className="card-note">
          {erro ?? "Gerir equipe é do administrador da plataforma ou de quem gestiona um departamento."}
        </p>
      </ShellCard>
    );
  }

  const escopo = dados.scope;
  return (
    <div className="stack">
      <ShellCard className="table-card equipe-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Configurações</span>
            <h2>Equipe e acessos</h2>
          </div>
          {escopo.canInvite ? (
            <Button
              variant="primary"
              icon={<IconPlus />}
              disabled={salvando}
              onClick={() =>
                setFormulario({ modo: "convite", nome: "", email: "", acesso: ACESSO_VAZIO })
              }
            >
              Novo acesso
            </Button>
          ) : null}
        </div>

        {erro ? <p className="card-note auth-error">{erro}</p> : null}
        {aviso ? <p className="card-note auth-success">{aviso}</p> : null}

        <ShellTable caption="Pessoas com acesso ao sistema">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Acesso</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.members.length === 0 ? (
              <tr>
                <td colSpan={4}>Nenhuma pessoa com acesso ao sistema.</td>
              </tr>
            ) : null}
            {dados.members.map((membro) => (
              <tr key={membro.id}>
                <td>
                  <div className="equipe-membro">
                    <span className="equipe-avatar" aria-hidden="true">{iniciais(membro.name)}</span>
                    <span>
                      <strong>{membro.name}</strong>
                      <span className="card-note">{membro.email}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="equipe-acesso">
                    <strong>{tituloAcesso(membro.access)}</strong>
                    <span>{resumoAcesso(membro.access)}</span>
                  </div>
                </td>
                <td>
                  <Badge tone={STATUS_TOM[membro.status]}>
                    {STATUS_LABEL[membro.status]}
                  </Badge>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconEye />}
                      onClick={() => setMembroVisualizado(membro)}
                    >
                      Visualizar membro
                    </Button>
                    <DropdownMenu
                      label={`Mais ações para ${membro.name}`}
                      variant="icon"
                      disabled={salvando}
                      items={[
                        {
                          id: "alterar-acesso",
                          label: "Mudar acesso",
                          icon: <IconEdit />,
                          disabled: !membro.canManage,
                          onSelect: () => setFormulario({ modo: "edicao", membro, acesso: membro.access }),
                        },
                        {
                          id: "enviar-link",
                          label: "Enviar link de acesso",
                          icon: <IconReset />,
                          disabled: !membro.canManage || membro.status !== "invited",
                          onSelect: () => void acaoNoMembro(membro, "resend-invite"),
                        },
                        {
                          id: "desativar",
                          label: "Desativar acesso",
                          icon: <IconTrash />,
                          danger: true,
                          disabled: !membro.canDeactivate,
                          onSelect: () => void acaoNoMembro(membro, "deactivate"),
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
      </ShellCard>

      {formulario ? (
        <Dialog
          title={formulario.modo === "convite" ? "Novo acesso" : "Editar acesso"}
          description={formulario.modo === "convite" ? "Cadastre uma nova pessoa e defina o acesso inicial." : formulario.membro.email}
          icon={formulario.modo === "convite" ? <IconPlus /> : <IconEdit />}
          onClose={() => setFormulario(null)}
          size="larga"
          footer={
            <Button
              variant="primary"
              icon={<IconSave />}
              loading={salvando}
              onClick={() => void enviar()}
            >
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
              <dd><Badge tone={STATUS_TOM[membroVisualizado.status]}>{STATUS_LABEL[membroVisualizado.status]}</Badge></dd>
            </div>
            <div>
              <dt>Acesso</dt>
              <dd>{resumoAcesso(membroVisualizado.access)}</dd>
            </div>
          </dl>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * Editor do acesso. Desenha só o que o escopo do servidor permite conceder —
 * um gestor de Energia não vê a Waze aqui, e não vê papel que ele próprio não
 * tem. Cada empresa é um bloco: entrar nela é uma escolha, e papel e
 * departamento só existem dentro dela.
 */
function EditorDeAcesso({
  escopo,
  valor,
  onChange,
}: {
  escopo: TeamScope;
  valor: UserAccess;
  onChange: (proximo: UserAccess) => void;
}) {
  function empresaAtual(companyId: CompanyKey) {
    return valor.companies.find((empresa) => empresa.companyId === companyId);
  }

  function alteraEmpresa(
    companyId: CompanyKey,
    altera: (atual: UserAccess["companies"][number]) => UserAccess["companies"][number] | null,
  ) {
    const atual = empresaAtual(companyId) ?? { companyId, roles: [], departments: [] };
    const proxima = altera(atual);
    const outras = valor.companies.filter((empresa) => empresa.companyId !== companyId);
    const companies = proxima ? [...outras, proxima] : outras;
    // Ordem do catálogo, sempre: sem isto marcar e desmarcar a Waze faria a
    // linha de resumo trocar de ordem sozinha, como se algo mais tivesse mudado.
    onChange({
      ...valor,
      companies: companyKeys.flatMap(
        (chave) => companies.filter((empresa) => empresa.companyId === chave),
      ),
    });
  }

  return (
    <div className="acesso-editor">
      {escopo.isPlatformAdmin ? (
        <label className="acesso-linha">
          <input
            type="checkbox"
            checked={valor.platformRoles.includes("admin")}
            onChange={(evento) =>
              onChange({ ...valor, platformRoles: evento.target.checked ? ["admin"] : [] })
            }
          />
          <span>
            <strong>Administração da plataforma</strong>
            <span className="card-note">
              Alcança as duas empresas e todos os departamentos, e pode gerir a equipe inteira.
            </span>
          </span>
        </label>
      ) : null}

      {escopo.companies.map((empresa) => {
        const atual = empresaAtual(empresa.companyId);
        const ligada = atual !== undefined;

        return (
          <fieldset className="acesso-empresa" key={empresa.companyId}>
            <legend>
              <label className="acesso-linha">
                <input
                  type="checkbox"
                  checked={ligada}
                  onChange={(evento) =>
                    alteraEmpresa(empresa.companyId, () =>
                      evento.target.checked
                        ? { companyId: empresa.companyId, roles: ["viewer"], departments: [] }
                        : null,
                    )
                  }
                />
                <strong>{EMPRESAS_POR_ID[empresa.companyId].nome}</strong>
              </label>
            </legend>

            {ligada ? (
              <div className="acesso-grupos">
                <div className="acesso-grupo">
                  <span className="eyebrow">Papéis nesta empresa</span>
                  {empresa.roles.map((papel) => (
                    <label className="acesso-linha" key={papel}>
                      <input
                        type="checkbox"
                        checked={atual.roles.includes(papel)}
                        onChange={(evento) =>
                          alteraEmpresa(empresa.companyId, (empresaAtual) => ({
                            ...empresaAtual,
                            roles: evento.target.checked
                              ? [...empresaAtual.roles, papel]
                              : empresaAtual.roles.filter((atualPapel) => atualPapel !== papel),
                          }))
                        }
                      />
                      <span>{PAPEL_LABEL[papel] ?? papel}</span>
                    </label>
                  ))}
                </div>

                <div className="acesso-grupo">
                  <span className="eyebrow">Departamentos</span>
                  {empresa.departmentIds.map((departamento) => {
                    const liberado = atual.departments.find(
                      (entrada) => entrada.departmentId === departamento,
                    );
                    return (
                      <div className="acesso-departamento" key={departamento}>
                        <label className="acesso-linha">
                          <input
                            type="checkbox"
                            checked={liberado !== undefined}
                            onChange={(evento) =>
                              alteraEmpresa(empresa.companyId, (empresaAtual) => ({
                                ...empresaAtual,
                                departments: evento.target.checked
                                  ? [
                                      ...empresaAtual.departments,
                                      { departmentId: departamento, isManager: false },
                                    ]
                                  : empresaAtual.departments.filter(
                                      (entrada) => entrada.departmentId !== departamento,
                                    ),
                              }))
                            }
                          />
                          <span>{departamentoLabel(empresa.companyId, departamento)}</span>
                        </label>

                        {liberado && empresa.canGrantManager ? (
                          <label className="acesso-linha acesso-linha--aninhada">
                            <input
                              type="checkbox"
                              checked={liberado.isManager}
                              onChange={(evento) =>
                                alteraEmpresa(empresa.companyId, (empresaAtual) => ({
                                  ...empresaAtual,
                                  departments: empresaAtual.departments.map((entrada) =>
                                    entrada.departmentId === departamento
                                      ? { ...entrada, isManager: evento.target.checked }
                                      : entrada,
                                  ),
                                }))
                              }
                            />
                            <span>Gestor do departamento — pode convidar e editar aqui</span>
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="card-note">
                Sem acesso a esta empresa: não vê os dados nem navega o contexto dela.
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
