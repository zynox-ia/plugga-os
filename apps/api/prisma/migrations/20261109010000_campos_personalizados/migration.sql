ALTER TABLE pipelines ADD COLUMN fields jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE deals ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pipelines ADD CONSTRAINT pipelines_fields_array CHECK (jsonb_typeof(fields) = 'array');
ALTER TABLE deals ADD CONSTRAINT deals_custom_fields_object CHECK (jsonb_typeof(custom_fields) = 'object');
-- Busca por identidade do campo inclui valores preservados após transferência.
CREATE INDEX deals_custom_fields_gin ON deals USING gin (custom_fields);
