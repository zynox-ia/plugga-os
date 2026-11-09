-- PLU-313: associação de dados e ficha prospectiva, sem ativar o fluxo Solar.
-- Colunas herdam RLS, locks e versionamento das tabelas já protegidas.
ALTER TABLE "pipelines" ADD COLUMN "process_profile" JSONB;
ALTER TABLE "deals" ADD COLUMN "solar_project" JSONB;
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_process_profile_object"
  CHECK ("process_profile" IS NULL OR jsonb_typeof("process_profile") = 'object');
ALTER TABLE "deals" ADD CONSTRAINT "deals_solar_project_object"
  CHECK ("solar_project" IS NULL OR jsonb_typeof("solar_project") = 'object');
