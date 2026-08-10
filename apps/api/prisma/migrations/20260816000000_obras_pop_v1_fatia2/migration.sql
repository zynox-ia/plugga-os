-- Execução e Gestão de Obras — POP-OBR-001 v1, segunda fatia (10/08/2026).
--
-- Pendência de campo (§6), medição técnica (§9) e versionamento de projeto
-- (§3). Aditiva: nenhuma tabela existente muda de forma.

CREATE TYPE "public"."pendencia_tipo" AS ENUM (
  'material_insuficiente',
  'divergencia_projeto',
  'condicao_insegura',
  'acesso_indisponivel',
  'cliente_pendente',
  'equipe_indisponivel',
  'outro'
);

CREATE TYPE "public"."pendencia_status" AS ENUM ('aberta', 'encerrada');

CREATE TYPE "public"."medicao_status" AS ENUM ('pendente', 'aprovada', 'em_correcao');

CREATE TYPE "public"."projeto_versao_status" AS ENUM ('elaboracao', 'em_aprovacao', 'aprovado', 'superado');

CREATE TABLE "public"."pendencias_de_campo" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "tipo" "public"."pendencia_tipo" NOT NULL,
  "prioridade" TEXT,
  "status" "public"."pendencia_status" NOT NULL DEFAULT 'aberta',
  "descricao" TEXT NOT NULL,
  "aberta_por_id" UUID NOT NULL,
  "encerrado_por_id" UUID,
  "encerrado_em" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pendencias_de_campo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pendencias_de_campo_obra_id_status_idx" ON "public"."pendencias_de_campo"("obra_id", "status");

CREATE TABLE "public"."medicoes_tecnicas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "etapa_executada" TEXT NOT NULL,
  "pendencias_remanescentes" TEXT,
  "status" "public"."medicao_status" NOT NULL DEFAULT 'pendente',
  "responsavel_id" UUID NOT NULL,
  "aprovado_por_id" UUID,
  "aprovado_em" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "medicoes_tecnicas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "medicoes_tecnicas_obra_id_status_idx" ON "public"."medicoes_tecnicas"("obra_id", "status");

CREATE TABLE "public"."projeto_versoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obra_id" UUID NOT NULL,
  "versao" INTEGER NOT NULL,
  "status" "public"."projeto_versao_status" NOT NULL DEFAULT 'elaboracao',
  "descricao" TEXT NOT NULL,
  "autor_id" UUID NOT NULL,
  "aprovado_por_id" UUID,
  "aprovado_em" TIMESTAMPTZ(6),
  "justificativa_reabertura" TEXT,
  "arquivo_chave" TEXT,
  "arquivo_nome" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projeto_versoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projeto_versoes_obra_id_versao_key" ON "public"."projeto_versoes"("obra_id", "versao");
CREATE INDEX "projeto_versoes_obra_id_status_idx" ON "public"."projeto_versoes"("obra_id", "status");

ALTER TABLE "public"."pendencias_de_campo" ADD CONSTRAINT "pendencias_de_campo_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."pendencias_de_campo" ADD CONSTRAINT "pendencias_de_campo_aberta_por_id_fkey"
  FOREIGN KEY ("aberta_por_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pendencias_de_campo" ADD CONSTRAINT "pendencias_de_campo_encerrado_por_id_fkey"
  FOREIGN KEY ("encerrado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."medicoes_tecnicas" ADD CONSTRAINT "medicoes_tecnicas_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."medicoes_tecnicas" ADD CONSTRAINT "medicoes_tecnicas_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."medicoes_tecnicas" ADD CONSTRAINT "medicoes_tecnicas_aprovado_por_id_fkey"
  FOREIGN KEY ("aprovado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."projeto_versoes" ADD CONSTRAINT "projeto_versoes_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."projeto_versoes" ADD CONSTRAINT "projeto_versoes_autor_id_fkey"
  FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."projeto_versoes" ADD CONSTRAINT "projeto_versoes_aprovado_por_id_fkey"
  FOREIGN KEY ("aprovado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
