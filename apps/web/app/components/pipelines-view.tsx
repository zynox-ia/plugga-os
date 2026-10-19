"use client";

import { useState } from "react";

import { Modal } from "./modal";
import { ShellCard, StatusPill } from "./plugga-shell";

/**
 * Pipelines (em construção). A configuração dos pipelines não tem item de menu:
 * abre num modal pelo botão desta tela (decisão do André, 19/10/2026).
 */
export function PipelinesView() {
  const [configurando, setConfigurando] = useState(false);

  return (
    <ShellCard className="panel-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Comercial</span>
          <h2>Pipelines</h2>
        </div>
        <div className="row-actions">
          <StatusPill>Em construção</StatusPill>
          <button className="button button--secondary" type="button" onClick={() => setConfigurando(true)}>
            Configurar pipelines
          </button>
        </div>
      </div>
      <p className="card-note">
        Os pipelines de venda, um por aba, com os negócios em Kanban e em Lista. Cada pipeline pertence a uma empresa e tem as próprias
        etapas. A tela está sendo construída.
      </p>

      {configurando ? (
        <Modal rotulo="Configurar pipelines" aoFechar={() => setConfigurando(false)}>
          <div className="modal-topo">
            <h2>Configurar pipelines</h2>
            <button className="botao-fechar" type="button" aria-label="Fechar" onClick={() => setConfigurando(false)}>
              ✕
            </button>
          </div>
          <div className="modal-corpo">
            <StatusPill>Em construção</StatusPill>
            <p className="ficha-vazio">
              Aqui o gestor vai criar e manter os pipelines: nome, empresa, etapas, campos, etiquetas, motivos de perda e quem trabalha em
              cada um.
            </p>
          </div>
        </Modal>
      ) : null}
    </ShellCard>
  );
}
