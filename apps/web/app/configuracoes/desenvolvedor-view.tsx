"use client";

import type { JobRunInventoryItem } from "@plugga/shared";
import { Cpu, Server, Terminal, Webhook } from "lucide-react";
import Link from "next/link";

import { EstadoDaApi } from "../components/estado-da-api";
import { JobsView } from "../components/jobs-view";
import { Badge, TextField } from "../components/ui";
import { erroDe, type ErroDeApi } from "../lib/api-core";
import styles from "./configuracoes.module.css";

type DesenvolvedorViewProps = {
  jobsDados?: { items: JobRunInventoryItem[]; isLive: boolean } | null;
  erroJobs?: ErroDeApi | null;
};

export function DesenvolvedorView({ jobsDados, erroJobs }: DesenvolvedorViewProps) {
  return (
    <div className={styles.painel}>
      <header className={styles.cabecalho}>
        <div className={styles.cabecalhoTexto}>
          <h3>Painel do Desenvolvedor & Infraestrutura</h3>
          <p>Execuções de jobs e informações técnicas disponíveis para consulta.</p>
        </div>
        <div className={styles.cabecalhoAcoes}>
          <Link href="/jobs" className="button button--secondary ui-button ui-button--sm">Ver jobs</Link>
          <Link href="/relatorios" className="button button--secondary ui-button ui-button--sm">Ver relatórios</Link>
        </div>
      </header>

      <div className={styles.grade}>
        <section className={`${styles.secao} ${styles.secaoLarga}`} aria-label="Status dos serviços">
          <h4>
            <Server size={16} aria-hidden="true" />
            Serviços & Infraestrutura
          </h4>
          <p className="card-note">A saúde dos serviços não foi verificada nesta tela.</p>
          <div className={styles.gridStatusServicos}>
            {["PostgreSQL", "Redis", "API NestJS", "RustFS Storage"].map((servico) => (
              <div className={styles.cardServico} key={servico}>
                <div className={styles.cardServicoTopo}>
                  <strong>{servico}</strong>
                  <Badge tone="neutral">Não verificado</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.secao} aria-label="Ambiente e runtime">
          <h4>
            <Terminal size={16} aria-hidden="true" />
            Ambiente & Runtime
          </h4>
          <div className={styles.camposUnicaColuna}>
            <TextField label="Ambiente atual" value="Não verificado" readOnly />
            <TextField label="Última verificação de saúde" value="Não disponível" readOnly />
          </div>
        </section>

        <section className={styles.secao} aria-label="Webhooks">
          <h4>
            <Webhook size={16} aria-hidden="true" />
            Webhooks
          </h4>
          <p className="card-note">Configuração e disponibilidade de webhooks não verificadas nesta tela.</p>
        </section>

        <section className={`${styles.secao} ${styles.secaoLarga}`} aria-label="Execuções de jobs">
          <h4>
            <Cpu size={16} aria-hidden="true" />
            Execuções de jobs
          </h4>
          {!erroJobs && jobsDados?.isLive ? (
            <JobsView items={jobsDados.items} isLive={jobsDados.isLive} />
          ) : (
            <EstadoDaApi erro={erroJobs ?? erroDe("indisponivel")} eyebrow="Jobs" />
          )}
        </section>
      </div>
    </div>
  );
}
