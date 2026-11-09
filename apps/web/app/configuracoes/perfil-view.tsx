"use client";

import { papelDoAcesso } from "@plugga/shared";
import { Info, Save, UserRound } from "lucide-react";

import { Badge, Button, TextField } from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";

export function PerfilView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  const rotuloPapel = ROTULO_DO_PAPEL[papelDoAcesso(usuario.acesso)];

  return (
    <div className={styles.painel}>
      <section className={styles.cardPerfilUnificado} aria-label="Identificação e contato">
        <div className={styles.perfilTopoUnificado}>
          <span className={styles.perfilAvatar} aria-hidden="true">
            <UserRound size={32} strokeWidth={1.6} />
          </span>
          <div className={styles.perfilTopoInfo}>
            <div className={styles.perfilTopoTituloLinha}>
              <strong>{usuario.name}</strong>
              <Badge tone="info">{rotuloPapel}</Badge>
            </div>
            <span className={styles.perfilTopoEmail}>{usuario.email}</span>
            <span className={styles.perfilTopoMeta}>Plugga OS · Waze Energia</span>
          </div>
        </div>

        <div className={styles.perfilDados}>
          <h3 className={styles.perfilDadosTitulo}>Informações pessoais</h3>
          <div className={styles.perfilGradeCampos}>
            <div className={styles.campoLargo}>
              <TextField
                label="Nome Completo"
                value={usuario.name}
                readOnly
              />
            </div>
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
          </div>
        </div>

        <footer className={styles.perfilRodape}>
          <p className={styles.perfilRodapeNota}>
            <Info size={16} aria-hidden="true" />
            <span>Dados somente para consulta. Edição e foto em preparação.</span>
          </p>
          <Button type="button" variant="primary" size="sm" icon={<Save size={14} />} disabled>
            Salvar perfil
          </Button>
        </footer>
      </section>
    </div>
  );
}
