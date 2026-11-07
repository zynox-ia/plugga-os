"use client";

import { Bell, Save, Target } from "lucide-react";

import { Alert, Button, Switch } from "../components/ui";
import styles from "./configuracoes.module.css";

export function NotificacoesView() {
  return (
    <div className={styles.painel}>
      <header className={styles.cabecalho}>
        <div className={styles.cabecalhoTexto}>
          <h3>Preferências de Notificações</h3>
          <p>Exemplos de alertas do CRM, prazos operacionais e canais de entrega.</p>
        </div>
        <div className={styles.cabecalhoAcoes}>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            disabled
          >
            Salvar preferências
          </Button>
        </div>
      </header>

      <Alert title="Em preparação">
        As opções abaixo são ilustrativas. Estas preferências ainda não podem ser alteradas ou aplicadas.
      </Alert>

      <div className={styles.grade}>
        {/* Seção 1: CRM & Vendas */}
        <section className={styles.secao} aria-label="Notificações do CRM">
          <h4>
            <Target size={16} aria-hidden="true" />
            CRM & Vendas
          </h4>
          <div className={styles.camposUnicaColuna}>
            <Switch
              label="Novos leads atribuídos"
              description="Notificação imediata ao receber um lead ou oportunidade na sua carteira."
              defaultChecked
              disabled
            />
            <Switch
              label="Avanço de etapas no pipeline"
              description="Avisos quando oportunidades em que você é responsável mudarem de fase no funil."
              defaultChecked
              disabled
            />
            <Switch
              label="Lembretes de tarefas e atividades"
              description="Notificações de compromissos agendados e alertas de prazos no início do dia."
              defaultChecked
              disabled
            />
          </div>
        </section>

        {/* Seção 2: Comunicação & Sistema */}
        <section className={styles.secao} aria-label="Comunicação e alertas">
          <h4>
            <Bell size={16} aria-hidden="true" />
            Comunicação & Sistema
          </h4>
          <div className={styles.camposUnicaColuna}>
            <Switch
              label="Alertas na barra superior"
              description="Exibir contador e painel suspenso no ícone de notificações da topbar."
              defaultChecked
              disabled
            />
            <Switch
              label="Alertas de segurança e logins"
              description="Avisos sobre novos acessos identificados na sua conta corporativa."
              defaultChecked
              disabled
            />
            <Switch
              label="Resumo semanal por e-mail"
              description="Consolidado de oportunidades, fechamentos e metas enviado toda segunda-feira."
              defaultChecked={false}
              disabled
            />
          </div>
        </section>
      </div>
    </div>
  );
}
