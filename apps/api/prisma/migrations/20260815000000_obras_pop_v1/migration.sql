-- Execução e Gestão de Obras — POP-OBR-001 v1 + FLX-OBR-001 (10/08/2026).
--
-- Primeira fatia: estados da Obra (§2), evidência de campo (§5.1) e segurança
-- do trabalho — EPI/APR/incidente/liberação (§8). Projeto versionado,
-- pendência de campo e medição técnica ficam para uma fatia seguinte.
--
-- Aditiva: `obras`, `pedidos_de_compra` e as demais tabelas do Compras não
-- mudam de forma, só `obras` ganha a coluna `etapa_atual` e relações reversas.

CREATE TYPE "public"."obra_etapa" AS ENUM (
  'obra_criada',
  'projeto_em_elaboracao',
  'em_aprovacao_tecnica',
  'projeto_aprovado',
  'liberacao_campo_pendente',
  'liberada_para_execucao',
  'em_execucao',
  'pendencia_campo',
  'medicao_tecnica',
  'medicao_aprovada',
  'obra_concluida_tecnicamente',
  'obra_encerrada'
);

CREATE TYPE "public"."evidencia_tipo" AS ENUM ('imagem', 'pdf', 'documento', 'checklist');

CREATE TYPE "public"."papel_liberador" AS ENUM ('seguranca', 'supervisor', 'engenheiro');

ALTER TABLE "public"."obras"
  ADD COLUMN "etapa_atual" "public"."obra_etapa" NOT NULL DEFAULT 'obra_criada';

CREATE INDEX "obras_company_id_etapa_atual_idx" ON "public"."obras"("company_id", "etapa_atual");

CREATE TABLE "public"."obra_etapas_historico" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "etapa" "public"."obra_etapa" NOT NULL,
  "entrou_em" TIMESTAMPTZ(6) NOT NULL,
  "saiu_em" TIMESTAMPTZ(6),
  "responsavel_id" UUID,
  CONSTRAINT "obra_etapas_historico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "obra_etapas_historico_obra_id_entrou_em_idx"
  ON "public"."obra_etapas_historico"("obra_id", "entrou_em");

-- Uma passagem aberta por vez, garantido pelo banco — mesmo argumento do
-- Compras: duas etapas abertas na mesma obra tornariam "em que etapa a obra
-- está" ambíguo.
CREATE UNIQUE INDEX "obra_etapas_historico_uma_aberta_por_obra"
  ON "public"."obra_etapas_historico"("obra_id")
  WHERE "saiu_em" IS NULL;

CREATE TABLE "public"."evidencias_de_obra" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "etapa" "public"."obra_etapa" NOT NULL,
  "autor_id" UUID NOT NULL,
  "tipo" "public"."evidencia_tipo" NOT NULL,
  "descricao" TEXT NOT NULL,
  "status_relacionado" TEXT,
  "arquivo_chave" TEXT NOT NULL,
  "arquivo_nome" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidencias_de_obra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidencias_de_obra_obra_id_etapa_idx" ON "public"."evidencias_de_obra"("obra_id", "etapa");

-- Append-only: reaproveita a mesma função que já protege `event_log` (POP
-- §5.1 — "nem admin remove fisicamente evidência pelo sistema operacional
-- padrão"). A função já existe desde a migração fundacional.
CREATE TRIGGER evidencias_de_obra_append_only
  BEFORE UPDATE OR DELETE ON "public"."evidencias_de_obra"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TABLE "public"."registros_epi" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "colaborador_id" UUID,
  "equipe_descricao" TEXT,
  "epi_exigido" TEXT NOT NULL,
  "conferido_em" TIMESTAMPTZ(6),
  "conferido_por_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registros_epi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registros_epi_obra_id_idx" ON "public"."registros_epi"("obra_id");

CREATE TABLE "public"."registros_apr" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "atividade" TEXT NOT NULL,
  "seguranca_assinou_id" UUID,
  "seguranca_assinou_em" TIMESTAMPTZ(6),
  "supervisor_assinou_id" UUID,
  "supervisor_assinou_em" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registros_apr_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registros_apr_obra_id_idx" ON "public"."registros_apr"("obra_id");

CREATE TABLE "public"."incidentes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "ocorreu_em" TIMESTAMPTZ(6) NOT NULL,
  "local" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "envolvidos" TEXT,
  "tipo" TEXT NOT NULL,
  "gravidade" TEXT NOT NULL,
  "acao_imediata" TEXT,
  "registrado_por_id" UUID NOT NULL,
  "responsavel_tratativa_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incidentes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incidentes_obra_id_gravidade_idx" ON "public"."incidentes"("obra_id", "gravidade");

CREATE TABLE "public"."liberacoes_seguranca" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "incidente_id" UUID,
  "papel_liberador" "public"."papel_liberador" NOT NULL,
  "liberado_por_id" UUID NOT NULL,
  "liberado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_por_id" UUID,
  "revogado_em" TIMESTAMPTZ(6),
  "motivo_revogacao" TEXT,
  CONSTRAINT "liberacoes_seguranca_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liberacoes_seguranca_obra_id_idx" ON "public"."liberacoes_seguranca"("obra_id");

ALTER TABLE "public"."obra_etapas_historico" ADD CONSTRAINT "obra_etapas_historico_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."obra_etapas_historico" ADD CONSTRAINT "obra_etapas_historico_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."evidencias_de_obra" ADD CONSTRAINT "evidencias_de_obra_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."evidencias_de_obra" ADD CONSTRAINT "evidencias_de_obra_autor_id_fkey"
  FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."registros_epi" ADD CONSTRAINT "registros_epi_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."registros_epi" ADD CONSTRAINT "registros_epi_colaborador_id_fkey"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."registros_epi" ADD CONSTRAINT "registros_epi_conferido_por_id_fkey"
  FOREIGN KEY ("conferido_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."registros_apr" ADD CONSTRAINT "registros_apr_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."registros_apr" ADD CONSTRAINT "registros_apr_seguranca_assinou_id_fkey"
  FOREIGN KEY ("seguranca_assinou_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."registros_apr" ADD CONSTRAINT "registros_apr_supervisor_assinou_id_fkey"
  FOREIGN KEY ("supervisor_assinou_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."incidentes" ADD CONSTRAINT "incidentes_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."incidentes" ADD CONSTRAINT "incidentes_registrado_por_id_fkey"
  FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."incidentes" ADD CONSTRAINT "incidentes_responsavel_tratativa_id_fkey"
  FOREIGN KEY ("responsavel_tratativa_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."liberacoes_seguranca" ADD CONSTRAINT "liberacoes_seguranca_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."liberacoes_seguranca" ADD CONSTRAINT "liberacoes_seguranca_incidente_id_fkey"
  FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."liberacoes_seguranca" ADD CONSTRAINT "liberacoes_seguranca_liberado_por_id_fkey"
  FOREIGN KEY ("liberado_por_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."liberacoes_seguranca" ADD CONSTRAINT "liberacoes_seguranca_revogado_por_id_fkey"
  FOREIGN KEY ("revogado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
