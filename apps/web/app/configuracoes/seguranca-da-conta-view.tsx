"use client";

import { KeyRound, Lock } from "lucide-react";

import { Button, TextField } from "../components/ui";
import { useSessionUser } from "../lib/use-session-user";
import styles from "./configuracoes.module.css";
import { SegurancaView } from "./seguranca-view";

export function SegurancaDaContaView() {
  const { usuario } = useSessionUser();
  if (!usuario) return null;

  return (
    <div className={styles.painel}>
      <div className={styles.grade}>
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

        <SegurancaView />
      </div>
    </div>
  );
}
