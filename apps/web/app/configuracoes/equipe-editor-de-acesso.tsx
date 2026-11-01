"use client";

import { Fragment, useState } from "react";
import {
  telasPorDepartamento,
  type Acesso,
  type Departamento as DepartamentoId,
  type EscopoDaEquipe,
  type NivelDeDepartamento,
  type Tela,
} from "@plugga/shared";

import {
  Checkbox,
  Heading,
  IconBriefcase,
  IconChevronDown,
  IconChevronUp,
  IconCode,
  IconLayers,
  IconShield,
  IconUser,
  Radio,
} from "../components/ui";
import { DEPARTAMENTOS, ROTULO_DO_PAPEL } from "../lib/organizacao";
import { DESCRICAO_DO_DEPARTAMENTO } from "./equipe-rotulos";

/**
 * Editor do acesso. Desenha os papéis permitidos pelo escopo (Membro, Diretor, Admin, DEV),
 * e para quem é de departamento permite selecionar os departamentos e expandir suas telas internas (processos).
 */
export function EditorDeAcesso({
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

  const telasSelecionadas = Object.fromEntries(valor.departamentos.map((d) => [d.departamento, d.telas ?? [...telasPorDepartamento[d.departamento]]]));
  const concediveis = (departamento: DepartamentoId): Tela[] => telasPorDepartamento[departamento].filter((tela) => escopo.telasConcediveis?.includes(tela) ?? true);

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
    const proximos = checked ? [...outros, { departamento, nivel, telas: concediveis(departamento) }] : outros;

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

  function definirTelas(deptId: DepartamentoId, telas: Tela[]) {
    onChange({ ...valor, departamentos: valor.departamentos.map((d) => d.departamento === deptId ? { ...d, telas } : d) });
  }

  function toggleTela(deptId: DepartamentoId, tela: Tela, checked: boolean) {
    const atuais = telasSelecionadas[deptId] ?? [];
    definirTelas(deptId, checked ? [...atuais, tela] : atuais.filter((id) => id !== tela));
  }

  function marcarTodasTelas(deptId: DepartamentoId) {
    definirTelas(deptId, concediveis(deptId));
  }

  function desmarcarTodasTelas(deptId: DepartamentoId) {
    definirTelas(deptId, []);
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
                  const telasAtivas = (telasSelecionadas[departamento.id] ?? []).length;

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
                                    telasSelecionadas[departamento.id] ?? []
                                  ).includes(processo.id!);
                                  return (
                                    <div className="ui-processo-item" key={processo.label}>
                                      <Checkbox
                                        label={processo.label}
                                        checked={marcado}
                                        disabled={escopo.telasConcediveis !== undefined && !escopo.telasConcediveis.includes(processo.id!)}
                                        onChange={(e) =>
                                          toggleTela(departamento.id, processo.id!, e.target.checked)
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
