-- Remove o modelo antigo de acesso (empresa × departamento × cargo). Tudo o que
-- ele dizia já foi convertido para `user_departamentos` pela migração
-- `acesso_por_departamento_conversao`, que roda antes desta em qualquer banco.
-- Daqui em diante o acesso é só papel de plataforma (`user_platform_roles`) e
-- departamento com nível (`user_departamentos`).

-- DropForeignKey
ALTER TABLE "public"."user_company_memberships" DROP CONSTRAINT "user_company_memberships_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_company_memberships" DROP CONSTRAINT "user_company_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_company_roles" DROP CONSTRAINT "user_company_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_company_roles" DROP CONSTRAINT "user_company_roles_user_id_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_department_access" DROP CONSTRAINT "user_department_access_user_id_company_id_fkey";

-- DropTable
DROP TABLE "public"."user_company_memberships";

-- DropTable
DROP TABLE "public"."user_company_roles";

-- DropTable
DROP TABLE "public"."user_department_access";

-- Os cargos saem do catálogo: só restam os dois papéis de plataforma. Nenhuma
-- linha de `user_platform_roles` aponta para eles (só `admin` era de plataforma).
DELETE FROM "public"."roles" WHERE "key" NOT IN ('admin', 'desenvolvedor');
