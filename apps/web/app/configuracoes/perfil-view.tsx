"use client";

import { papelDoAcesso } from "@plugga/shared";
import { Camera, Save, UserRound } from "lucide-react";

import { Alert, Badge, Button, TextField } from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";

export function PerfilView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  const rotuloPapel = ROTULO_DO_PAPEL[papelDoAcesso(usuario.acesso)];

  return (
    <div className={styles.painel}>
      <Alert tone="info" title="Perfil em preparação">
        Você pode consultar seus dados. A edição do perfil e a foto estão em preparação.
      </Alert>

      <div className={styles.identidadeUsuario}>
        <button
          type="button"
          className={styles.fotoDropzone}
          disabled
          aria-label="Foto de perfil em preparação"
        >
          <Camera size={24} strokeWidth={1.6} aria-hidden={true} />
          <span className={styles.fotoDropzoneTexto}>Foto em preparação</span>
        </button>

        <div className={styles.perfilTopoInfo}>
          <div className={styles.perfilTopoTituloLinha}>
            <strong>{usuario.name}</strong>
            <Badge tone="info">{rotuloPapel}</Badge>
          </div>
          <span className={styles.perfilTopoEmail}>{usuario.email}</span>
          <span className={styles.perfilTopoMeta}>Plugga OS · Waze Energia</span>
        </div>
      </div>

      <section className={styles.secao} aria-label="Identificação e contato">
        <h4>
          <UserRound size={16} aria-hidden="true" />
          Identificação & Contato
        </h4>
        <div className={styles.camposUnicaColuna}>
          <TextField
            label="Nome Completo"
            value={usuario.name}
            readOnly
          />
          <TextField
            label="E-mail"
            type="email"
            value={usuario.email}
            readOnly
          />
          <TextField
            label="Celular / WhatsApp"
            value=""
            disabled
            placeholder="Em preparação"
          />
          <div className={styles.rodape}>
            <Button type="button" variant="primary" size="sm" icon={<Save size={14} />} disabled>
              Salvar perfil
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
