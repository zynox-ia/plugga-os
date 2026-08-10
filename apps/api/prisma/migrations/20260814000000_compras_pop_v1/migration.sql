-- Compras e Suprimentos — POP-COMP-001 v2.3 + FLX-COMP (14/08/2026).
--
-- Traz o processo de compras do funil C43 do Bitrix para dentro do OS. Aditiva:
-- nenhuma tabela existente muda de forma, só ganham relação reversa.
--
-- Os CHECK abaixo não são gerados pelo Prisma e são escritos à mão de
-- propósito: são invariantes que o POP exige e que não podem depender só da
-- camada de aplicação para valer.

CREATE TYPE "public"."compras_etapa" AS ENUM (
  'pedido_gerado',
  'analise_estoque',
  'cotacoes',
  'aprovacao_compra',
  'pagamento',
  'retirada',
  'concluido'
);

CREATE TYPE "public"."compras_origem_atendimento" AS ENUM ('estoque', 'aquisicao');

CREATE TYPE "public"."compras_destino" AS ENUM ('obra', 'cliente', 'interno');

CREATE TABLE "public"."fornecedores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "documento" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fornecedores_company_id_documento_key"
  ON "public"."fornecedores"("company_id", "documento");
CREATE INDEX "fornecedores_company_id_ativo_idx"
  ON "public"."fornecedores"("company_id", "ativo");

CREATE TABLE "public"."obras" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "client_id" UUID,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "obras_company_id_ativa_idx" ON "public"."obras"("company_id", "ativa");

CREATE TABLE "public"."pedidos_de_compra" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "titulo" TEXT NOT NULL,
  "destino" "public"."compras_destino" NOT NULL,
  "obra_id" UUID,
  "client_id" UUID,
  "solicitante_id" UUID NOT NULL,
  "responsavel_id" UUID,
  "prazo_entrega_desejado" TIMESTAMPTZ(6) NOT NULL,
  "etapa" "public"."compras_etapa" NOT NULL DEFAULT 'pedido_gerado',
  "origem_atendimento" "public"."compras_origem_atendimento",
  "necessidade_validada_em" TIMESTAMPTZ(6),
  "cotacao_selecionada_id" UUID,
  "selecionou_cotacao_id" UUID,
  "aprovou_id" UUID,
  "valor_orcado" DECIMAL(14,2) NOT NULL,
  "valor_cotado" DECIMAL(14,2),
  "valor_faturado" DECIMAL(14,2),
  "concluido_em" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pedidos_de_compra_pkey" PRIMARY KEY ("id")
);

-- O POP §2 avisa que não preencher a Obra/Cliente "impossibilita a análise
-- financeira correta". O destino é sempre um dos três, e cada um exige
-- exatamente o vínculo que lhe corresponde — nem a mais, nem a menos.
ALTER TABLE "public"."pedidos_de_compra"
  ADD CONSTRAINT "pedidos_de_compra_destino_coerente" CHECK (
    ("destino" = 'obra'    AND "obra_id" IS NOT NULL AND "client_id" IS NULL)
    OR ("destino" = 'cliente' AND "client_id" IS NOT NULL AND "obra_id" IS NULL)
    OR ("destino" = 'interno' AND "obra_id" IS NULL AND "client_id" IS NULL)
  );

-- Orçado é o denominador da Assertividade Global (POP §4.1). Zero deixaria o
-- indicador sem denominador, e a divisão morreria no cálculo em vez de aqui.
ALTER TABLE "public"."pedidos_de_compra"
  ADD CONSTRAINT "pedidos_de_compra_valor_orcado_positivo" CHECK ("valor_orcado" > 0);

CREATE UNIQUE INDEX "pedidos_de_compra_company_id_numero_key"
  ON "public"."pedidos_de_compra"("company_id", "numero");
CREATE UNIQUE INDEX "pedidos_de_compra_cotacao_selecionada_id_key"
  ON "public"."pedidos_de_compra"("cotacao_selecionada_id");
CREATE INDEX "pedidos_de_compra_company_id_etapa_idx"
  ON "public"."pedidos_de_compra"("company_id", "etapa");
CREATE INDEX "pedidos_de_compra_company_id_responsavel_id_etapa_idx"
  ON "public"."pedidos_de_compra"("company_id", "responsavel_id", "etapa");
CREATE INDEX "pedidos_de_compra_company_id_concluido_em_idx"
  ON "public"."pedidos_de_compra"("company_id", "concluido_em");

CREATE TABLE "public"."itens_de_pedido" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pedido_id" UUID NOT NULL,
  "descricao" TEXT NOT NULL,
  "quantidade" DECIMAL(14,3) NOT NULL,
  "unidade" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "itens_de_pedido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "itens_de_pedido_quantidade_positiva" CHECK ("quantidade" > 0)
);

CREATE INDEX "itens_de_pedido_pedido_id_idx" ON "public"."itens_de_pedido"("pedido_id");

CREATE TABLE "public"."pedidos_de_compra_etapas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pedido_id" UUID NOT NULL,
  "etapa" "public"."compras_etapa" NOT NULL,
  "entrou_em" TIMESTAMPTZ(6) NOT NULL,
  "prazo_dias_uteis" INTEGER NOT NULL,
  "prazo_em" TIMESTAMPTZ(6) NOT NULL,
  "saiu_em" TIMESTAMPTZ(6),
  "cumpriu_prazo" BOOLEAN,
  "responsavel_id" UUID,
  CONSTRAINT "pedidos_de_compra_etapas_pkey" PRIMARY KEY ("id"),
  -- `concluido` é terminal, não etapa mensurada: não tem SLA no POP §3, e uma
  -- linha aqui com prazo inventado contaminaria o indicador 4.3.
  CONSTRAINT "pedidos_de_compra_etapas_sem_terminal" CHECK ("etapa" <> 'concluido')
);

CREATE INDEX "pedidos_de_compra_etapas_pedido_id_entrou_em_idx"
  ON "public"."pedidos_de_compra_etapas"("pedido_id", "entrou_em");
CREATE INDEX "pedidos_de_compra_etapas_etapa_saiu_em_idx"
  ON "public"."pedidos_de_compra_etapas"("etapa", "saiu_em");

-- Uma passagem aberta por vez, garantido pelo banco e não só pela transação:
-- duas etapas abertas no mesmo pedido tornariam "qual é o prazo corrente"
-- ambíguo, e o indicador 4.2 contaria a mesma OS em dois estados.
CREATE UNIQUE INDEX "pedidos_de_compra_etapas_uma_aberta_por_pedido"
  ON "public"."pedidos_de_compra_etapas"("pedido_id")
  WHERE "saiu_em" IS NULL;

CREATE TABLE "public"."cotacoes_de_compra" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pedido_id" UUID NOT NULL,
  "fornecedor_id" UUID NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "valor_frete" DECIMAL(14,2),
  "prazo_entrega_dias" INTEGER,
  "condicoes_pagamento" TEXT,
  "arquivo_chave" TEXT NOT NULL,
  "arquivo_nome" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cotacoes_de_compra_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cotacoes_de_compra_valor_positivo" CHECK ("valor" > 0)
);

CREATE INDEX "cotacoes_de_compra_pedido_id_idx" ON "public"."cotacoes_de_compra"("pedido_id");
CREATE INDEX "cotacoes_de_compra_fornecedor_id_idx" ON "public"."cotacoes_de_compra"("fornecedor_id");

ALTER TABLE "public"."fornecedores" ADD CONSTRAINT "fornecedores_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."obras" ADD CONSTRAINT "obras_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."obras" ADD CONSTRAINT "obras_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_solicitante_id_fkey"
  FOREIGN KEY ("solicitante_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_cotacao_selecionada_id_fkey"
  FOREIGN KEY ("cotacao_selecionada_id") REFERENCES "public"."cotacoes_de_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."itens_de_pedido" ADD CONSTRAINT "itens_de_pedido_pedido_id_fkey"
  FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_de_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."pedidos_de_compra_etapas" ADD CONSTRAINT "pedidos_de_compra_etapas_pedido_id_fkey"
  FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_de_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."pedidos_de_compra_etapas" ADD CONSTRAINT "pedidos_de_compra_etapas_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."cotacoes_de_compra" ADD CONSTRAINT "cotacoes_de_compra_pedido_id_fkey"
  FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_de_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."cotacoes_de_compra" ADD CONSTRAINT "cotacoes_de_compra_fornecedor_id_fkey"
  FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
