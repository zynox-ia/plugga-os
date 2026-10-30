-- Departamentos novos: Suprimentos e Marketing, nas duas empresas.
--
-- Departamentos são catálogo fixo em `packages/shared/src/organization.ts` e
-- não têm tabela; o que esta migração grava é o acesso das pessoas a eles.
--
-- Compras saiu do Financeiro e foi para Suprimentos na barra lateral. Quem vê
-- Compras hoje a vê pelo departamento `financeiro`; sem esta cópia, essa pessoa
-- deixaria de ver o item no menu assim que o departamento novo existisse. Cada
-- acesso `financeiro` ganha o par `suprimentos` na mesma empresa e com o mesmo
-- `is_manager`. O acesso `financeiro` não é tocado: a API de Compras continua
-- autorizando por ele, e Financeiro continua visível para quem já o via.
--
-- Isso inclui os admins de plataforma, que têm `financeiro` gravado desde a
-- migração `admin_acesso_explicito`.

INSERT INTO "user_department_access" ("user_id", "company_id", "department_id", "is_manager")
SELECT "user_id", "company_id", 'suprimentos', "is_manager"
FROM "user_department_access"
WHERE "department_id" = 'financeiro'
ON CONFLICT ("user_id", "company_id", "department_id") DO NOTHING;

-- Marketing não existia: ninguém o via antes, então ninguém perde nada e não há
-- o que copiar. O admin de plataforma também não ganha linha: o alcance dele é
-- regra (`visibleDepartments` abre todos os departamentos do catálogo), não
-- concessão, e admins novos não têm membership para receber uma. Quem mais
-- precisar de Marketing recebe pela tela de Equipe.
