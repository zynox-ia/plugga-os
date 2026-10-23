-- Cadastro único de clientes (PLU-268, ADR-0013).
--
-- Puramente aditiva: as colunas novas de `clients` são opcionais, e
-- `person_type` nasce `pj` para os registros existentes (cadastros de empresa).
-- `company` e `segment` continuam para o módulo comercial antigo até a PLU-271.
-- `document` guarda só dígitos (CNPJ 14 ou CPF 11): opcional, único quando
-- informado. `birth_date` é texto AAAA-MM-DD (data de calendário, sem fuso).
-- A regra de um contato principal por cliente fica na API.

-- CreateEnum
CREATE TYPE "client_person_type" AS ENUM ('pf', 'pj');

-- CreateEnum
CREATE TYPE "client_origin" AS ENUM ('indicacao', 'instagram', 'whatsapp', 'site', 'telefone', 'email', 'evento', 'prospeccao_ativa', 'cliente_existente', 'parceiro', 'outro');

-- CreateEnum
CREATE TYPE "client_contact_role" AS ENUM ('decisor', 'representante_legal', 'tecnico', 'financeiro', 'outro');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "address_complement" TEXT,
ADD COLUMN     "birth_date" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" "client_origin",
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "person_type" "client_person_type" NOT NULL DEFAULT 'pj',
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "rg_issuer" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT,
    "role" "client_contact_role",
    "phone" TEXT,
    "phone_is_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "cpf" TEXT,
    "rg" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_document_key" ON "clients"("document");

-- CreateIndex
CREATE INDEX "clients_owner_id_idx" ON "clients"("owner_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

