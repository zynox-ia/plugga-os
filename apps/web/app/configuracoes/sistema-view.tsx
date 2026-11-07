"use client";

import { Building2, HardDrive, Save, Sliders } from "lucide-react";

import { Alert, Button, SelectField, TextField } from "../components/ui";
import styles from "./configuracoes.module.css";

export function SistemaView() {
  return (
    <div className={styles.painel}>
      <header className={styles.cabecalho}>
        <div className={styles.cabecalhoTexto}>
          <h3>Configurações do Sistema</h3>
          <p>Exemplos de parâmetros da organização e preferências do sistema.</p>
        </div>
        <div className={styles.cabecalhoAcoes}>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            disabled
          >
            Salvar alterações
          </Button>
        </div>
      </header>

      <Alert title="Em preparação">
        Os valores abaixo são ilustrativos e não representam as configurações ou regras em vigor.
        Estas preferências ainda não podem ser alteradas ou aplicadas.
      </Alert>

      <div className={styles.grade}>
        {/* Seção 1: Parâmetros da Organização */}
        <section className={styles.secao} aria-label="Parâmetros da organização">
          <h4>
            <Building2 size={16} aria-hidden="true" />
            Parâmetros da Organização
          </h4>
          <div className={styles.campos}>
            <TextField
              label="Razão Social"
              defaultValue="Organização de exemplo Ltda."
              disabled
            />
            <TextField
              label="Nome de Exibição"
              defaultValue="Organização de exemplo"
              disabled
            />
            <SelectField
              label="Fuso Horário"
              defaultValue="America/Sao_Paulo"
              disabled
              options={[
                { value: "America/Sao_Paulo", label: "Horário de Brasília (UTC-3)" },
                { value: "America/Manaus", label: "Horário do Amazonas (UTC-4)" },
              ]}
            />
            <SelectField
              label="Moeda Padrão"
              defaultValue="BRL"
              disabled
              options={[
                { value: "BRL", label: "Real Brasileiro (BRL - R$)" },
                { value: "USD", label: "Dólar Americano (USD - $)" },
              ]}
            />
          </div>
        </section>

        {/* Seção 2: Políticas do CRM */}
        <section className={styles.secao} aria-label="Políticas do CRM">
          <h4>
            <Sliders size={16} aria-hidden="true" />
            Políticas do CRM & Operações
          </h4>
          <div className={styles.campos}>
            <TextField
              label="Alerta de Lead Estagnado (dias)"
              type="number"
              defaultValue="7"
              disabled
              hint="Prazo ilustrativo; não altera os alertas do pipeline."
            />
            <SelectField
              label="Política de Conversão em Cliente"
              defaultValue="direta"
              disabled
              options={[
                { value: "direta", label: "Exemplo: conversão direta pelo operador" },
                { value: "aprovacao", label: "Exemplo: aprovação do gerente de vendas" },
              ]}
            />
            <TextField
              label="Documentação em Propostas"
              defaultValue="Exemplo: documentação no contrato"
              disabled
              className={styles.campoLargo}
            />
          </div>
        </section>

        {/* Seção 3: Armazenamento e Arquivos */}
        <section className={`${styles.secao} ${styles.secaoLarga}`} aria-label="Armazenamento e arquivos">
          <h4>
            <HardDrive size={16} aria-hidden="true" />
            Armazenamento de Arquivos & Mídia
          </h4>
          <div className={styles.campos}>
            <TextField
              label="Provedor de Armazenamento"
              defaultValue="Provedor de exemplo"
              disabled
            />
            <SelectField
              label="Limite por Arquivo"
              defaultValue="10mb"
              disabled
              options={[
                { value: "10mb", label: "Exemplo: até 10 MB por documento" },
                { value: "25mb", label: "Exemplo: até 25 MB por documento" },
              ]}
            />
            <TextField
              label="Formatos Aceitos"
              defaultValue="Exemplo: PDF, DOCX, XLSX, PNG e JPG"
              disabled
              className={styles.campoLargo}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
