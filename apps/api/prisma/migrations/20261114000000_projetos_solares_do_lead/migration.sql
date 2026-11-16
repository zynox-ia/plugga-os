-- Projetos Solar do lead: lista interna do modal (não cria card no Kanban).
ALTER TABLE "deals" ADD COLUMN "solar_projects" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "deals" ADD CONSTRAINT "deals_solar_projects_array"
  CHECK (jsonb_typeof("solar_projects") = 'array');
