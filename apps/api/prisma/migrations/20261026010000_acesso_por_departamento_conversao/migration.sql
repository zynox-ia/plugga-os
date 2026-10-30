-- Converte o acesso antigo (empresa × departamento × papel por cargo) no modelo
-- de 4 papéis. É a mesma regra de `converterAcessoAntigo`
-- (packages/shared/src/acesso.ts); test/acesso-por-departamento.integration.spec.ts
-- confere que as duas dão o mesmo resultado.
--
-- - admin de plataforma não ganha linha: o alcance dele é regra;
-- - cada departamento liberado vira o departamento unificado (os dois
--   comerciais viram `crm`);
-- - é gerente quem era gestor do departamento ou tinha `diretoria` na empresa;
-- - o mesmo departamento nas duas empresas fica com o nível mais alto;
-- - ninguém vira desenvolvedor, nem quem tinha `tech`.
--
-- Idempotente: pode rodar de novo sobre a tabela já preenchida sem mudar nada.

INSERT INTO "public"."user_departamentos" ("user_id", "departamento", "nivel")
SELECT
    acesso."user_id",
    CASE
        WHEN acesso."department_id" IN ('comercial-clientes', 'comercial-obras') THEN 'crm'
        ELSE acesso."department_id"
    END AS "departamento",
    CASE
        WHEN bool_or(acesso."is_manager" OR diretoria."user_id" IS NOT NULL) THEN 'gerente'
        ELSE 'membro'
    END::"public"."nivel_de_departamento" AS "nivel"
FROM "public"."user_department_access" AS acesso
LEFT JOIN (
    SELECT papel."user_id", papel."company_id"
    FROM "public"."user_company_roles" AS papel
    JOIN "public"."roles" AS role ON role."id" = papel."role_id"
    WHERE role."key" = 'diretoria'
) AS diretoria
    ON diretoria."user_id" = acesso."user_id"
   AND diretoria."company_id" = acesso."company_id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."user_platform_roles" AS plataforma
    JOIN "public"."roles" AS role ON role."id" = plataforma."role_id"
    WHERE plataforma."user_id" = acesso."user_id"
      AND role."key" = 'admin'
)
-- Só os pares que o catálogo de `organization.ts` reconhece: a leitura do
-- acesso antigo (`mapUserAccess`) já descarta os outros como lixo de migração.
AND (acesso."company_id", acesso."department_id") IN (
    ('plugga', 'comercial-clientes'), ('plugga', 'energia-opm'),
    ('plugga', 'produto-tecnologia'), ('plugga', 'suprimentos'),
    ('plugga', 'financeiro'), ('plugga', 'marketing'),
    ('waze', 'comercial-obras'), ('waze', 'engenharia-obras'),
    ('waze', 'suprimentos'), ('waze', 'financeiro'), ('waze', 'marketing')
)
GROUP BY 1, 2
ON CONFLICT ("user_id", "departamento") DO NOTHING;
