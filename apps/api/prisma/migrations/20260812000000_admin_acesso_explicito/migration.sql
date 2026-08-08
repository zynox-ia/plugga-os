-- Acesso explícito para quem é admin de plataforma.
--
-- A migração anterior só dá associação de empresa a quem tinha papel
-- *não*-admin, então uma conta admin pura sai dela com zero empresas e zero
-- departamentos. Na prática ela continua enxergando tudo, porque
-- `visibleCompanies` e `visibleDepartments` abrem geral para admin de
-- plataforma — mas o acesso fica implícito num atalho de código, não gravado.
--
-- Duas consequências disso, e são as razões desta migração:
--
--   1. a tela de Equipe mostra o admin sem empresa nenhuma, o que é falso;
--   2. no dia em que alguém tirar o papel de plataforma dessa conta, ela cai
--      para nada — sem aviso, porque nunca houve registro do que ela acessava.
--
-- Aqui o acesso vira dado. A regra é por papel, não por pessoa: quem for admin
-- de plataforma participa das duas empresas e de todos os departamentos.
--
-- Os departamentos são catálogo fixo em `packages/shared/src/organization.ts`
-- (`departmentIdsByCompany`) e não têm tabela; a lista abaixo precisa
-- acompanhar aquela. Departamento novo lá exige linha nova aqui.

INSERT INTO "user_company_memberships" ("user_id", "company_id")
SELECT p."user_id", c."id"
FROM "user_platform_roles" p
JOIN "roles" r ON r."id" = p."role_id" AND r."key" = 'admin'
CROSS JOIN "companies" c
ON CONFLICT ("user_id", "company_id") DO NOTHING;

-- `is_manager` verdadeiro: admin de plataforma já pode gerir qualquer
-- departamento pelo atalho, e registrar diferente faria a tela de Equipe
-- contradizer o que o sistema de fato permite.
INSERT INTO "user_department_access" ("user_id", "company_id", "department_id", "is_manager")
SELECT p."user_id", d."company_id", d."department_id", true
FROM "user_platform_roles" p
JOIN "roles" r ON r."id" = p."role_id" AND r."key" = 'admin'
CROSS JOIN (VALUES
    ('plugga', 'comercial-clientes'),
    ('plugga', 'energia-opm'),
    ('plugga', 'produto-tecnologia'),
    ('plugga', 'financeiro'),
    ('waze', 'comercial-obras'),
    ('waze', 'engenharia-obras'),
    ('waze', 'financeiro')
) AS d("company_id", "department_id")
ON CONFLICT ("user_id", "company_id", "department_id") DO NOTHING;
