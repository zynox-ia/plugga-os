-- Configuração dos modelos; nenhum dado de cliente é criado pela migration.
CREATE TABLE "lead_proposal_templates" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "style" TEXT NOT NULL CHECK ("style" IN ('essencial', 'consultiva')),
  "position" INTEGER NOT NULL,
  "defaults" JSONB NOT NULL
);

CREATE TABLE "lead_proposals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "number" SERIAL NOT NULL UNIQUE,
  "deal_id" UUID NOT NULL REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "template_id" UUID NOT NULL REFERENCES "lead_proposal_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'generated')),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
  "generation_token" UUID,
  "generation_started_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("generation_token" IS NULL) = ("generation_started_at" IS NULL))
);
CREATE INDEX "lead_proposals_deal_id_updated_at_id_idx" ON "lead_proposals"("deal_id", "updated_at", "id");

CREATE TABLE "lead_proposal_versions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" UUID NOT NULL REFERENCES "lead_proposals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "document_id" UUID NOT NULL UNIQUE REFERENCES "lead_documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "content" JSONB NOT NULL,
  "template_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("proposal_id", "version")
);
CREATE FUNCTION "preservar_versao_proposta"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Versões de proposta são imutáveis';
END;
$$;
CREATE TRIGGER "lead_proposal_versions_immutable" BEFORE UPDATE OR DELETE ON "lead_proposal_versions"
FOR EACH ROW EXECUTE FUNCTION "preservar_versao_proposta"();

INSERT INTO "lead_proposal_templates" ("id", "name", "description", "style", "position", "defaults") VALUES
('bead0000-0000-4000-8000-000000000001', 'Proposta essencial', 'Apresentação objetiva, escopo e condições comerciais em um documento compacto.', 'essencial', 0,
 '{"introduction":"Apresentamos nossa proposta para apoiar sua empresa na redução de custos e na gestão eficiente da energia, com acompanhamento próximo em cada etapa.","scope":"Diagnóstico inicial do consumo, recomendação da solução e acompanhamento da implantação. O escopo definitivo será alinhado com o cliente antes do início dos serviços.","payment":"Condições de pagamento e cronograma acordados na aprovação da proposta. Validade conforme a data indicada neste documento."}'),
('bead0000-0000-4000-8000-000000000002', 'Proposta consultiva', 'Capa de apresentação e detalhamento da solução, investimento e condições.', 'consultiva', 1,
 '{"introduction":"Uma parceria para transformar necessidades em resultados. Esta proposta reúne a solução recomendada e as condições para avançarmos com segurança e clareza.","scope":"Levantamento das necessidades, análise de viabilidade, apresentação da solução recomendada e acompanhamento técnico e comercial durante a implantação.","payment":"Pagamento e etapas de execução definidos em conjunto. Serviços adicionais dependem de alinhamento e aprovação prévios."}');
