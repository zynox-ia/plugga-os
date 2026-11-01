"use client";

import { alcancaTela, papelDoAcesso, type MembroDaEquipe } from "@plugga/shared";

import {
  Badge,
  Button,
  Dialog,
  Heading,
  IconBriefcase,
  IconCheck,
  IconCode,
  IconCopy,
  IconEdit,
  IconEye,
  IconLayers,
  IconShield,
  IconUser,
} from "../components/ui";
import { DEPARTAMENTOS, ROTULO_DO_PAPEL } from "../lib/organizacao";
import {
  DESCRICAO_DO_DEPARTAMENTO,
  NIVEL_LABEL,
  PAPEL_DESCRICAO,
  STATUS_LABEL,
  STATUS_TOM,
  formatarDataHora,
} from "./equipe-rotulos";

export function DetalhesDoMembro({
  membro,
  onClose,
  onEditar,
  onCopiarEmail,
}: {
  membro: MembroDaEquipe;
  onClose: () => void;
  onEditar: (membro: MembroDaEquipe) => void;
  onCopiarEmail: (membro: MembroDaEquipe) => void | Promise<void>;
}) {
  return (
      <Dialog
        title="Detalhes do Membro"
        description={membro.email}
        icon={<IconEye />}
        onClose={onClose}
        size="media"
        cancelText="Fechar"
        footer={
          membro.podeEditar ? (
            <Button
              variant="secondary"
              icon={<IconEdit />}
              onClick={() => onEditar(membro)}
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
                <span className="ui-view-value">{membro.name}</span>
              </div>
              <div className="ui-view-field">
                <span className="ui-view-label">E-mail Corporativo</span>
                <div className="ui-view-value-with-action">
                  <span className="ui-view-value">{membro.email}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<IconCopy />}
                    iconOnly
                    aria-label={`Copiar e-mail de ${membro.name}`}
                    onClick={() => void onCopiarEmail(membro)}
                  />
                </div>
              </div>
              <div className="ui-view-field">
                <span className="ui-view-label">Situação da Conta</span>
                <div className="ui-view-value">
                  <Badge tone={STATUS_TOM[membro.status]}>
                    {STATUS_LABEL[membro.status]}
                  </Badge>
                </div>
              </div>
              <div className="ui-view-field">
                <span className="ui-view-label">Data de Cadastro</span>
                <span className="ui-view-value">{formatarDataHora(membro.createdAt)}</span>
              </div>
            </div>
          </section>

          {/* Seção 2: Papel e Nível de Acesso */}
          {(() => {
            const papel = papelDoAcesso(membro.acesso);
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
                        {membro.acesso.plataforma !== null ? "Acesso à Plataforma" : "Acesso por Departamento"}
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

            {membro.acesso.plataforma !== null ? (
              <>
                <div className="ui-view-global-alert">
                  <IconShield className="ui-view-global-alert-icon" width={18} height={18} aria-hidden="true" />
                  <div>
                    <strong>Acesso Global Liberado:</strong> Como {ROTULO_DO_PAPEL[papelDoAcesso(membro.acesso)]}, este membro possui acesso irrestrito a todos os {DEPARTAMENTOS.length} departamentos e todas as telas do sistema.
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
            ) : membro.acesso.departamentos.length === 0 ? (
              <div className="ui-view-empty">
                Nenhum departamento atribuído a este membro no momento.
              </div>
            ) : (
              (() => {
                const deptosAtribuidos = membro.acesso.departamentos;
                const idsAtribuidos = new Set(deptosAtribuidos.map((d) => d.departamento));
                const outrosDepartamentos = DEPARTAMENTOS.filter((d) => !idsAtribuidos.has(d.id));

                return (
                  <>
                    <div className="ui-view-depts-list">
                      {deptosAtribuidos.map((entrada) => {
                        const deptInfo = DEPARTAMENTOS.find((d) => d.id === entrada.departamento);
                        if (!deptInfo) return null;
                        const liberados = deptInfo.processos.filter((proc) => proc.id && alcancaTela(membro.acesso, proc.id));
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
                              <span className="ui-view-processos-label">Telas Liberadas ({liberados.length})</span>
                              <div className="ui-view-tags">
                                {liberados.map((proc) => (
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
  );
}
