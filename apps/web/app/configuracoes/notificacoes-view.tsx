"use client";

import { Bell, Mail, Save } from "lucide-react";

import { Badge, Button, Switch } from "../components/ui";
import { CartaoDaConfiguracao } from "./cartao";
import styles from "./cartoes.module.css";

type Aviso = { id: string; label: string; description: string; ligado: boolean };

/** O que chega no sino da barra superior. */
const NO_SISTEMA: Aviso[] = [
  {
    id: "sistema-leads",
    label: "Novos leads atribuídos",
    description: "Ao receber um lead ou oportunidade na sua carteira.",
    ligado: true,
  },
  {
    id: "sistema-etapas",
    label: "Avanço de etapas no pipeline",
    description: "Quando uma oportunidade sua mudar de fase no funil.",
    ligado: true,
  },
  {
    id: "sistema-tarefas",
    label: "Lembretes de tarefas e atividades",
    description: "Compromissos agendados e prazos que vencem.",
    ligado: true,
  },
  {
    id: "sistema-seguranca",
    label: "Alertas de segurança e logins",
    description: "Novos acessos identificados na sua conta.",
    ligado: true,
  },
];

/** O que chega na caixa de entrada. */
const POR_EMAIL: Aviso[] = [
  {
    id: "email-leads",
    label: "Novos leads atribuídos",
    description: "Um e-mail ao receber um lead ou oportunidade.",
    ligado: false,
  },
  {
    id: "email-tarefas",
    label: "Lembretes de tarefas e atividades",
    description: "Resumo dos compromissos e prazos do dia, no início da manhã.",
    ligado: true,
  },
  {
    id: "email-seguranca",
    label: "Alertas de segurança e logins",
    description: "Novos acessos identificados na sua conta.",
    ligado: true,
  },
  {
    id: "email-resumo",
    label: "Resumo semanal",
    description: "Oportunidades, fechamentos e metas, toda segunda-feira.",
    ligado: false,
  },
];

function ListaDeAvisos({ avisos }: { avisos: Aviso[] }) {
  return (
    <ul className={styles.avisos}>
      {avisos.map((aviso) => (
        <li key={aviso.id}>
          <Switch
            id={aviso.id}
            label={aviso.label}
            description={aviso.description}
            defaultChecked={aviso.ligado}
            disabled
          />
        </li>
      ))}
    </ul>
  );
}

export function NotificacoesView() {
  const emPreparacao = <Badge tone="neutral">Em preparação</Badge>;

  return (
    <div className={styles.pagina}>
      <div className={styles.gradeDeCanais}>
        <CartaoDaConfiguracao
          titulo="No sistema"
          tituloId="notificacoes-sistema-titulo"
          icone={<Bell />}
          selo={emPreparacao}
          className={styles.compacto}
        >
          <div className={styles.corpo}>
            <ListaDeAvisos avisos={NO_SISTEMA} />
          </div>
        </CartaoDaConfiguracao>

        <CartaoDaConfiguracao
          titulo="Por e-mail"
          tituloId="notificacoes-email-titulo"
          icone={<Mail />}
          selo={emPreparacao}
          className={styles.compacto}
        >
          <div className={styles.corpo}>
            <ListaDeAvisos avisos={POR_EMAIL} />
          </div>
        </CartaoDaConfiguracao>
      </div>

      <div className={styles.acaoDaPagina}>
        <Button variant="primary" icon={<Save size={14} />} className={styles.botaoDoCartao} disabled>
          Salvar preferências
        </Button>
      </div>
    </div>
  );
}
