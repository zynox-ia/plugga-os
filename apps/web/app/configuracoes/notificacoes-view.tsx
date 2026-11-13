"use client";

import { Bell, Mail, Save } from "lucide-react";

import { Badge, Button, Switch } from "../components/ui";
import styles from "./cartoes.module.css";

/** `null` = o aviso não existe naquele canal. */
type Aviso = {
  id: string;
  label: string;
  description: string;
  sistema: boolean | null;
  email: boolean | null;
};

const AVISOS: Aviso[] = [
  {
    id: "leads",
    label: "Novos leads atribuídos",
    description: "Ao receber um lead ou oportunidade na sua carteira.",
    sistema: true,
    email: false,
  },
  {
    id: "etapas",
    label: "Avanço de etapas no pipeline",
    description: "Quando uma oportunidade sua mudar de fase no funil.",
    sistema: true,
    email: null,
  },
  {
    id: "tarefas",
    label: "Lembretes de tarefas e atividades",
    description: "Compromissos agendados e prazos que vencem.",
    sistema: true,
    email: true,
  },
  {
    id: "seguranca",
    label: "Alertas de segurança e logins",
    description: "Novos acessos identificados na sua conta.",
    sistema: true,
    email: true,
  },
  {
    id: "resumo",
    label: "Resumo semanal",
    description: "Oportunidades, fechamentos e metas, toda segunda-feira.",
    sistema: null,
    email: false,
  },
];

function Celula({ aviso, canal, ligado }: { aviso: Aviso; canal: "no sistema" | "por e-mail"; ligado: boolean | null }) {
  if (ligado === null) {
    return (
      <td className={styles.celulaDoCanal}>
        <span aria-hidden="true" className={styles.naoSeAplica}>
          —
        </span>
        <span className={styles.somenteLeitor}>
          {aviso.label}: não disponível {canal}
        </span>
      </td>
    );
  }
  return (
    <td className={styles.celulaDoCanal}>
      <Switch
        id={`${aviso.id}-${canal === "no sistema" ? "sistema" : "email"}`}
        label={`${aviso.label}, ${canal}`}
        defaultChecked={ligado}
        className={styles.chaveSemTexto}
        disabled
      />
    </td>
  );
}

export function NotificacoesView() {
  return (
    <div className={styles.pagina}>
      <section className={`${styles.vidro} ${styles.compacto}`} aria-label="Preferências de notificação">
        <table className={styles.tabelaDeAvisos}>
          <caption className={styles.somenteLeitor}>Quando ser avisado, em cada canal</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.somenteLeitor}>Aviso</span>
              </th>
              <th scope="col" className={styles.colunaDoCanal}>
                <span className={styles.tituloDoCanal}>
                  <Bell aria-hidden="true" />
                  No sistema
                </span>
              </th>
              <th scope="col" className={styles.colunaDoCanal}>
                <span className={styles.tituloDoCanal}>
                  <Mail aria-hidden="true" />
                  Por e-mail
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {AVISOS.map((aviso) => (
              <tr key={aviso.id}>
                <th scope="row" className={styles.nomeDoAviso}>
                  <strong>{aviso.label}</strong>
                  <small>{aviso.description}</small>
                </th>
                <Celula aviso={aviso} canal="no sistema" ligado={aviso.sistema} />
                <Celula aviso={aviso} canal="por e-mail" ligado={aviso.email} />
              </tr>
            ))}
          </tbody>
        </table>
        <footer className={styles.rodapeDaTabela}>
          <Badge tone="neutral">Em preparação</Badge>
          <Button variant="primary" icon={<Save size={14} />} className={styles.botaoDoCartao} disabled>
            Salvar preferências
          </Button>
        </footer>
      </section>
    </div>
  );
}
