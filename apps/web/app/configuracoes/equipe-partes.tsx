"use client";

import { useState } from "react";
import { papelDoAcesso, type Acesso, type MembroDaEquipe } from "@plugga/shared";

import { IconUser } from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { STATUS_LABEL, departamentoLabel, departamentosDoAcesso } from "./equipe-rotulos";

export function DepartamentosDaEquipe({ acesso }: { acesso: Acesso }) {
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

export function PapelBadge({ acesso }: { acesso: Acesso }) {
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

export function AvatarMembro({
  membro,
}: {
  membro: MembroDaEquipe & { avatarUrl?: string };
}) {
  const [erroImg, setErroImg] = useState(false);

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
        <span className="equipe-avatar" aria-hidden="true" title={membro.name}>
          <IconUser className="w-4 h-4" />
        </span>
      )}
      <span
        className={`equipe-presence-dot status-${membro.status}`}
        title={`Situação: ${STATUS_LABEL[membro.status]}`}
      />
    </div>
  );
}
