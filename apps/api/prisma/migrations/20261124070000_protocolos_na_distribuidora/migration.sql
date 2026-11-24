-- Protocolos na distribuidora (PLU-348), no lugar das 56 tarefas recorrentes
-- "acompanhar o protocolo" do Bitrix. Uma tabela para a Engenharia e o
-- Operacional (energia-opm), com o departamento como campo (E7).
--
--   * catálogo de distribuidoras (semeada a Amazonas Energia);
--   * protocolo com UC, distribuidora, tipo, número, abertura, data-limite,
--     próxima verificação e situação; verificações só por inserção;
--   * acesso pela tela de protocolos do departamento do protocolo
--     (engenharia-obras.protocolos ou energia-opm.protocolos); nada se apaga;
--   * as duas telas entram no catálogo de telas de acesso.

BEGIN;

CREATE TYPE "public"."tipo_de_protocolo" AS ENUM ('orcamento_de_conexao', 'liberacao', 'cusd', 'carta_denuncia', 'permanencia_no_cativo', 'retorno_ao_cativo', 'outros');

CREATE TYPE "public"."situacao_do_protocolo" AS ENUM ('aberto', 'em_analise', 'com_pendencia', 'respondido', 'liberado', 'indeferido');

CREATE TABLE "public"."distribuidoras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "uf" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "distribuidoras_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."protocolos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "consumer_unit_id" UUID NOT NULL,
    "distribuidora_id" TEXT NOT NULL,
    "tipo" "public"."tipo_de_protocolo" NOT NULL,
    "numero" TEXT NOT NULL,
    "aberto_em" TIMESTAMPTZ(6) NOT NULL,
    "data_limite" TIMESTAMPTZ(6) NOT NULL,
    "proxima_verificacao" TIMESTAMPTZ(6),
    "situacao" "public"."situacao_do_protocolo" NOT NULL DEFAULT 'aberto',
    "acao_pendente" TEXT,
    "observacao" TEXT,
    "encerrado_em" TIMESTAMPTZ(6),
    "criado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "protocolos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."verificacoes_de_protocolo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocolo_id" UUID NOT NULL,
    "por_id" UUID,
    "em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "situacao_anterior" "public"."situacao_do_protocolo" NOT NULL,
    "situacao" "public"."situacao_do_protocolo" NOT NULL,
    "nota" TEXT,
    "acao_pendente" TEXT,
    "proxima_verificacao" TIMESTAMPTZ(6),

    CONSTRAINT "verificacoes_de_protocolo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "distribuidoras_nome_key" ON "public"."distribuidoras"("nome");

CREATE INDEX "protocolos_departamento_situacao_idx" ON "public"."protocolos"("departamento", "situacao");

CREATE INDEX "protocolos_proxima_verificacao_idx" ON "public"."protocolos"("proxima_verificacao");

CREATE INDEX "protocolos_consumer_unit_id_idx" ON "public"."protocolos"("consumer_unit_id");

CREATE UNIQUE INDEX "protocolos_distribuidora_id_numero_key" ON "public"."protocolos"("distribuidora_id", "numero");

CREATE INDEX "verificacoes_de_protocolo_protocolo_id_em_idx" ON "public"."verificacoes_de_protocolo"("protocolo_id", "em");

ALTER TABLE "public"."protocolos" ADD CONSTRAINT "protocolos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."protocolos" ADD CONSTRAINT "protocolos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."protocolos" ADD CONSTRAINT "protocolos_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."protocolos" ADD CONSTRAINT "protocolos_distribuidora_id_fkey" FOREIGN KEY ("distribuidora_id") REFERENCES "public"."distribuidoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."protocolos" ADD CONSTRAINT "protocolos_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."verificacoes_de_protocolo" ADD CONSTRAINT "verificacoes_de_protocolo_protocolo_id_fkey" FOREIGN KEY ("protocolo_id") REFERENCES "public"."protocolos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."verificacoes_de_protocolo" ADD CONSTRAINT "verificacoes_de_protocolo_por_id_fkey" FOREIGN KEY ("por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.protocolos
  ADD CONSTRAINT protocolos_departamento CHECK (departamento IN ('engenharia-obras', 'energia-opm')),
  ADD CONSTRAINT protocolos_limite_depois_da_abertura CHECK (data_limite >= aberto_em),
  ADD CONSTRAINT protocolos_pendencia_com_acao CHECK ((situacao = 'com_pendencia') = (acao_pendente IS NOT NULL)),
  ADD CONSTRAINT protocolos_encerrado_coerente CHECK ((situacao IN ('respondido', 'liberado', 'indeferido')) = (encerrado_em IS NOT NULL)),
  ADD CONSTRAINT protocolos_encerrado_sem_verificacao CHECK (encerrado_em IS NULL OR proxima_verificacao IS NULL);
ALTER TABLE public.distribuidoras
  ADD CONSTRAINT distribuidoras_uf CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');

INSERT INTO public.distribuidoras (id, nome, sigla, uf, updated_at) VALUES ('amazonas-energia', 'Amazonas Energia', 'AmE', 'AM', now())
ON CONFLICT (id) DO NOTHING;

-- As telas novas no catálogo de telas de acesso (a mesma lista de acesso.ts).
-- O corpo é o de `remove_departamento_marketing` com as duas telas de
-- protocolos; CREATE OR REPLACE preserva dono, grants e a dependência do CHECK.
CREATE OR REPLACE FUNCTION plugga_security.telas_coerentes(p_departamento text, p_telas text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $2 IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest($2) t WHERE t IS NULL)
    AND cardinality($2) = (SELECT count(DISTINCT t) FROM unnest($2) t)
    AND coalesce($2 <@ CASE $1
      WHEN 'crm' THEN ARRAY['crm.pipelines', 'crm.clientes', 'crm.propostas', 'crm.contratos']
      WHEN 'energia-opm' THEN ARRAY['energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda', 'energia-opm.protocolos']
      WHEN 'produto-tecnologia' THEN ARRAY['produto-tecnologia.pluggamob', 'produto-tecnologia.eletropostos', 'produto-tecnologia.recargas', 'produto-tecnologia.parceiros', 'produto-tecnologia.dashboards']
      WHEN 'financeiro' THEN ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']
      WHEN 'suprimentos' THEN ARRAY['suprimentos.compras', 'suprimentos.fornecedores', 'suprimentos.estoque']
      WHEN 'engenharia-obras' THEN ARRAY['engenharia-obras.obras', 'engenharia-obras.projetos', 'engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas', 'engenharia-obras.usinas', 'engenharia-obras.relatorios', 'engenharia-obras.protocolos']
    END, false)
$fn$;
-- A lista só cresce: as linhas existentes continuam válidas e o CHECK fica como está.

DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['distribuidoras', 'protocolos', 'verificacoes_de_protocolo'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
  END LOOP;
END $regime$;
GRANT SELECT, INSERT, UPDATE ON public.distribuidoras TO plugga_runtime;
GRANT SELECT, INSERT, UPDATE ON public.protocolos TO plugga_runtime;
GRANT SELECT, INSERT ON public.verificacoes_de_protocolo TO plugga_runtime;

-- A tela de protocolos do departamento do protocolo. As funções de segurança vão
-- num (SELECT ...): o Postgres as avalia uma vez por comando (InitPlan), não por
-- linha; só a comparação com o departamento é da linha.
CREATE POLICY rls_ler ON public.distribuidoras FOR SELECT TO plugga_runtime
  USING ((SELECT plugga_security.no_departamento('engenharia-obras')) OR (SELECT plugga_security.no_departamento('energia-opm')));
CREATE POLICY rls_inserir ON public.distribuidoras FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos'], true)));
CREATE POLICY rls_atualizar ON public.distribuidoras FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos'], true)))
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos'], true)));

CREATE POLICY rls_ler ON public.protocolos FOR SELECT TO plugga_runtime
  USING ((departamento = 'engenharia-obras' AND (SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos']))) OR (departamento = 'energia-opm' AND (SELECT plugga_security.tem_tela(ARRAY['energia-opm.protocolos']))));
CREATE POLICY rls_inserir ON public.protocolos FOR INSERT TO plugga_runtime
  WITH CHECK (((departamento = 'engenharia-obras' AND (SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos']))) OR (departamento = 'energia-opm' AND (SELECT plugga_security.tem_tela(ARRAY['energia-opm.protocolos'])))) AND criado_por_id = (SELECT plugga_security.usuario_id()));
CREATE POLICY rls_atualizar ON public.protocolos FOR UPDATE TO plugga_runtime
  USING ((departamento = 'engenharia-obras' AND (SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos']))) OR (departamento = 'energia-opm' AND (SELECT plugga_security.tem_tela(ARRAY['energia-opm.protocolos']))))
  WITH CHECK ((departamento = 'engenharia-obras' AND (SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos']))) OR (departamento = 'energia-opm' AND (SELECT plugga_security.tem_tela(ARRAY['energia-opm.protocolos']))));
CREATE POLICY rls_ler ON public.verificacoes_de_protocolo FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_id));
CREATE POLICY rls_inserir ON public.verificacoes_de_protocolo FOR INSERT TO plugga_runtime
  WITH CHECK (por_id = (SELECT plugga_security.usuario_id()) AND EXISTS (SELECT 1 FROM public.protocolos p WHERE p.id = protocolo_id));

-- O protocolo não troca de departamento, empresa, cliente nem UC; o encerrado não volta.
CREATE FUNCTION plugga_security.protocolo_mantem_o_dono() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.departamento, NEW.company_id, NEW.client_id, NEW.consumer_unit_id, NEW.aberto_em, NEW.created_at)
     IS DISTINCT FROM (OLD.departamento, OLD.company_id, OLD.client_id, OLD.consumer_unit_id, OLD.aberto_em, OLD.created_at)
    OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL) THEN
    RAISE EXCEPTION 'departamento, empresa, cliente, UC e abertura do protocolo não mudam';
  END IF;
  IF OLD.encerrado_em IS NOT NULL AND NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em THEN
    RAISE EXCEPTION 'protocolo encerrado não reabre';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.protocolo_mantem_o_dono() FROM PUBLIC;
CREATE TRIGGER protocolos_mantem_o_dono BEFORE UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION plugga_security.protocolo_mantem_o_dono();

-- Clientes, UCs e pessoas dos protocolos: só id, nome e código, para quem tem
-- uma das telas de protocolos (o Operacional não tem as funções da Engenharia).
-- Funções próprias para não acrescentar ramo ao diretorio().
CREATE FUNCTION plugga_security.clientes_para_protocolos(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (c.active OR EXISTS (SELECT 1 FROM public.protocolos p WHERE p.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 500
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_para_protocolos(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_para_protocolos(text, uuid[]) TO plugga_runtime;

-- UCs dos clientes (ou as UCs pedidas): código e distribuidora.
CREATE FUNCTION plugga_security.ucs_para_protocolos(clientes uuid[], ucs uuid[])
RETURNS TABLE(id uuid, client_id uuid, code text, distributor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code, u.distributor FROM public.consumer_units u
  JOIN public.clients c ON c.id = u.client_id
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos'])
    AND (u.client_id = ANY(coalesce($1, ARRAY[]::uuid[])) OR u.id = ANY(coalesce($2, ARRAY[]::uuid[])))
    AND (c.active OR EXISTS (SELECT 1 FROM public.protocolos p WHERE p.consumer_unit_id = u.id))
  ORDER BY u.code
  LIMIT 5000
$fn$;
REVOKE ALL ON FUNCTION plugga_security.ucs_para_protocolos(uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.ucs_para_protocolos(uuid[], uuid[]) TO plugga_runtime;

-- Pessoas que criaram ou verificaram um protocolo: só id e nome.
CREATE FUNCTION plugga_security.pessoas_dos_protocolos(alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.id, s.name FROM public.users s
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.protocolos', 'energia-opm.protocolos']) AND s.id = ANY($1)
    AND (EXISTS (SELECT 1 FROM public.protocolos p WHERE p.criado_por_id = s.id)
      OR EXISTS (SELECT 1 FROM public.verificacoes_de_protocolo v WHERE v.por_id = s.id))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.pessoas_dos_protocolos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.pessoas_dos_protocolos(uuid[]) TO plugga_runtime;

COMMIT;
