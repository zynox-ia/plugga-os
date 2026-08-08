-- Equipe com acesso por empresa e departamento.
--
-- `user_roles` (papel global, sem contexto) deixa de existir: `admin` vira
-- papel de plataforma e todos os demais passam a valer dentro de uma empresa.
-- Nenhuma tabela aqui é trilha de auditoria, então nenhum gatilho append-only
-- é aplicado; as mutações de equipe são registradas em `event_log` (ADR-0007).

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Catálogo fixo: as mesmas chaves usadas pela navegação da web.
INSERT INTO "companies" ("id", "name") VALUES
    ('plugga', 'Plugga'),
    ('waze', 'Waze Energia');

-- CreateTable
CREATE TABLE "user_platform_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE "user_company_memberships" (
    "user_id" UUID NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_company_memberships_pkey" PRIMARY KEY ("user_id", "company_id")
);

CREATE TABLE "user_department_access" (
    "user_id" UUID NOT NULL,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "user_department_access_pkey" PRIMARY KEY ("user_id", "company_id", "department_id")
);

CREATE TABLE "user_company_roles" (
    "user_id" UUID NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "user_company_roles_pkey" PRIMARY KEY ("user_id", "company_id", "role_id")
);

-- CreateIndex
CREATE INDEX "user_platform_roles_role_id_idx" ON "user_platform_roles"("role_id");
CREATE INDEX "user_company_memberships_company_id_idx" ON "user_company_memberships"("company_id");
CREATE INDEX "user_department_access_company_id_department_id_idx" ON "user_department_access"("company_id", "department_id");
CREATE INDEX "user_company_roles_role_id_idx" ON "user_company_roles"("role_id");

-- AddForeignKey
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Acesso a departamento pende do vínculo com a empresa: sem membership não há
-- departamento, e revogar a empresa leva os departamentos junto.
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_user_id_company_id_fkey"
    FOREIGN KEY ("user_id", "company_id") REFERENCES "user_company_memberships"("user_id", "company_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_user_id_company_id_fkey"
    FOREIGN KEY ("user_id", "company_id") REFERENCES "user_company_memberships"("user_id", "company_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migração dos papéis globais existentes -------------------------------------
--
-- Ninguém perde nem ganha alcance nesta migração; o que muda é onde o alcance
-- está escrito. Hoje a sidebar não filtra nada, então todo mundo enxerga a
-- Plugga inteira — reproduzir exatamente isso é o único resultado verificável.
--
--   admin            -> papel de plataforma (continua alcançando as duas)
--   demais papéis    -> mesmo papel, agora dentro da Plugga
--   quem virou membro-> todos os departamentos da Plugga (sem gestão)
--
-- A Waze não recebe ninguém: não há como deduzir de um papel global quem
-- trabalha nela, e inventar acesso é pior do que um admin conceder depois.

INSERT INTO "user_platform_roles" ("user_id", "role_id")
SELECT ur."user_id", ur."role_id"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."key" = 'admin';

INSERT INTO "user_company_memberships" ("user_id", "company_id")
SELECT DISTINCT ur."user_id", 'plugga'
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."key" <> 'admin';

INSERT INTO "user_company_roles" ("user_id", "company_id", "role_id")
SELECT ur."user_id", 'plugga', ur."role_id"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."key" <> 'admin';

INSERT INTO "user_department_access" ("user_id", "company_id", "department_id", "is_manager")
SELECT m."user_id", 'plugga', d."department_id", false
FROM "user_company_memberships" m
CROSS JOIN (VALUES
    ('comercial-clientes'),
    ('energia-opm'),
    ('produto-tecnologia'),
    ('financeiro')
) AS d("department_id")
WHERE m."company_id" = 'plugga';

-- DropTable
DROP TABLE "user_roles";
