"use client";

import { papelDoAcesso } from "@plugga/shared";
import { Camera, KeyRound, Lock, Monitor, Save, ShieldCheck, UserRound } from "lucide-react";

import { Alert, Badge, Button, TextField } from "../components/ui";
import { ROTULO_DO_PAPEL } from "../lib/organizacao";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";
import { SegurancaView } from "./seguranca-view";

export function PerfilView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  const rotuloPapel = ROTULO_DO_PAPEL[papelDoAcesso(usuario.acesso)];

  return (
    <div className={styles.painel}>
      <SegurancaView />
      <Alert tone="info" title="Perfil em preparação">
        Você pode consultar seus dados. A edição do perfil, a foto e a troca de senha estão em preparação.
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

      <div className={styles.grade}>
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

        <section className={styles.secao} aria-label="Segurança e senha">
          <h4>
            <Lock size={16} aria-hidden="true" />
            Alterar Senha de Acesso
          </h4>
          <div className={styles.camposUnicaColuna}>
            <TextField
              type="password"
              label="Senha Atual"
              value=""
              disabled
              autoComplete="off"
              placeholder="Em preparação"
            />
            <TextField
              type="password"
              label="Nova Senha"
              value=""
              disabled
              autoComplete="off"
              placeholder="Em preparação"
            />
            <TextField
              type="password"
              label="Confirmar Nova Senha"
              value=""
              disabled
              autoComplete="off"
              placeholder="Em preparação"
            />
            <div className={styles.rodape}>
              <Button type="button" variant="primary" size="sm" icon={<KeyRound size={14} />} disabled>
                Atualizar senha
              </Button>
            </div>
          </div>
        </section>

        <section className={`${styles.secao} ${styles.secaoLarga}`} aria-label="Dados da sessão atual">
          <h4>
            <ShieldCheck size={16} aria-hidden="true" />
            Métodos de Autenticação & Sessão Conectada
          </h4>
          <div className={styles.camposUnicaColuna}>
            <div className={styles.linhaSessao}>
              <div className={styles.linhaSessaoInfo}>
                <Monitor size={18} aria-hidden="true" />
                <div>
                  <strong>Conta desta sessão</strong>
                  <span>{usuario.email}</span>
                </div>
              </div>
              <Badge tone="neutral">Sessão atual</Badge>
            </div>

            <div className={styles.linhaSessao}>
              <div className={styles.linhaSessaoInfo}>
                <ShieldCheck size={18} aria-hidden="true" />
                <div>
                  <strong>Método de autenticação</strong>
                  <span>Informação não disponível nesta tela.</span>
                </div>
              </div>
              <Badge tone="neutral">Não informado</Badge>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
