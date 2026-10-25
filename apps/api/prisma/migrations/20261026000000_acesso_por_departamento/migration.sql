-- Modelo de acesso de 4 papéis (packages/shared/src/acesso.ts): membro ou
-- gerente de um departamento, sem empresa; admin e desenvolvedor são papéis de
-- plataforma e continuam em `user_platform_roles`.
--
-- Esta migração só acrescenta. As tabelas antigas (memberships, papéis por
-- empresa e `user_department_access`) seguem sendo lidas pelas rotas até que
-- cada uma passe para o modelo novo; a conversão dos dados existentes está na
-- migração seguinte.

-- CreateEnum
CREATE TYPE "public"."nivel_de_departamento" AS ENUM ('membro', 'gerente');

-- CreateTable
CREATE TABLE "public"."user_departamentos" (
    "user_id" UUID NOT NULL,
    "departamento" TEXT NOT NULL,
    "nivel" "public"."nivel_de_departamento" NOT NULL,

    CONSTRAINT "user_departamentos_pkey" PRIMARY KEY ("user_id","departamento"),
    -- Mesmo catálogo de `departamentos` em acesso.ts. Um id fora dele seria um
    -- acesso que nenhuma tela mostra e nenhuma tela revoga.
    CONSTRAINT "user_departamentos_departamento_check" CHECK ("departamento" IN (
        'crm', 'energia-opm', 'produto-tecnologia', 'financeiro',
        'suprimentos', 'engenharia-obras', 'marketing'
    ))
);

-- CreateIndex
CREATE INDEX "user_departamentos_departamento_idx" ON "public"."user_departamentos"("departamento");

-- AddForeignKey
ALTER TABLE "public"."user_departamentos" ADD CONSTRAINT "user_departamentos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Papel de plataforma novo. Ninguém o recebe aqui: desenvolvedor é concedido à
-- mão, nunca por conversão (ver `converterAcessoAntigo`).
INSERT INTO "public"."roles" ("key", "name")
VALUES ('desenvolvedor', 'Desenvolvimento')
ON CONFLICT ("key") DO NOTHING;
