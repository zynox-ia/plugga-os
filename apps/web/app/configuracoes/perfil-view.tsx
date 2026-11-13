"use client";

import { papelDoAcesso } from "@plugga/shared";
import { Building2, Camera, Info, Lock, Mail, Save, UserRound } from "lucide-react";

import { Badge, Button, TextField } from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import { CartaoDaConfiguracao } from "./cartao";
import styles from "./cartoes.module.css";

export function PerfilView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  const rotuloPapel = ROTULO_DO_PAPEL[papelDoAcesso(usuario.acesso)];

  return (
    <div className={styles.perfil}>
      <section className={`${styles.vidro} ${styles.credencial}`} aria-label="Identificação e contato">
        <div className={styles.capa} aria-hidden="true">
          <svg
            className={styles.arcos}
            viewBox="0 0 300 300"
            fill="none"
            stroke="#fff"
            strokeOpacity=".28"
          >
            <circle cx="150" cy="150" r="60" />
            <circle cx="150" cy="150" r="95" />
            <circle cx="150" cy="150" r="130" />
            <circle cx="150" cy="150" r="165" />
          </svg>
        </div>
        <div className={styles.corpoCredencial}>
          <div className={styles.avatarBloco}>
            <span className={styles.avatar} aria-hidden="true">
              <UserRound strokeWidth={1.5} />
            </span>
            <span
              className={styles.avatarFoto}
              role="img"
              aria-label="Alterar foto: em preparação"
              title="Alterar foto: em preparação"
            >
              <Camera />
            </span>
          </div>
          <div className={styles.identidade}>
            <h2 className={styles.nome}>
              <span>{usuario.name}</span>
              <Badge tone="info">{rotuloPapel}</Badge>
            </h2>
            <ul className={styles.meta}>
              <li>
                <Mail aria-hidden="true" />
                {usuario.email}
              </li>
              <li>
                <Building2 aria-hidden="true" />
                Plugga OS · Waze Energia
              </li>
            </ul>
          </div>
        </div>
      </section>

      <CartaoDaConfiguracao
        titulo="Informações pessoais"
        tituloId="perfil-dados-titulo"
        icone={<UserRound />}
        selo={
          <Badge tone="neutral">
            <Lock size={12} aria-hidden="true" /> Somente consulta
          </Badge>
        }
      >
        <div className={`${styles.corpo} ${styles.camposTres}`}>
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
        </div>
        <footer className={styles.rodapeFicha}>
          <p className={styles.nota}>
            <Info aria-hidden="true" />
            <span>Dados somente para consulta. Edição e foto em preparação.</span>
          </p>
          <Button type="button" variant="primary" size="sm" icon={<Save size={14} />} disabled>
            Salvar perfil
          </Button>
        </footer>
      </CartaoDaConfiguracao>
    </div>
  );
}
