-- Usinas e monitoramento do dia (PLU-347), no lugar das 9 tarefas diárias
-- "olhei a plataforma" do Bitrix.
--
--   * plataformas de inversor (semeadas as 9, só os nomes; a observação de acesso
--     diz onde está o acesso, nunca a senha);
--   * usinas dos clientes (empresa, cliente, UC, kWp, plataforma, inversor);
--   * a conferência do dia por plataforma e empresa, com o print, e o resultado
--     de cada usina: só inserção (P1);
--   * a O.S. ganha a usina;
--   * lê quem é da Engenharia; escreve quem tem a tela de Usinas; plataformas só o
--     gerente; nada se apaga. Os nomes de clientes, UCs e pessoas passam a sair
--     para qualquer tela da Engenharia (as Usinas também precisam deles).

BEGIN;

CREATE TYPE "public"."situacao_do_monitoramento" AS ENUM ('normal', 'anomalia', 'sem_comunicacao');

CREATE TYPE "public"."origem_da_usina" AS ENUM ('manual', 'importacao', 'comissionamento');

ALTER TABLE "public"."ordens_de_servico" ADD COLUMN     "usina_id" UUID;

CREATE TABLE "public"."plataformas_de_inversor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacao_de_acesso" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plataformas_de_inversor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."usinas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "consumer_unit_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "plataforma_id" TEXT NOT NULL,
    "potencia_kwp" DECIMAL(10,3) NOT NULL,
    "fabricante" TEXT,
    "modelo" TEXT,
    "numero_serie" TEXT,
    "comissionada_em" TIMESTAMPTZ(6) NOT NULL,
    "garantia_ate" TIMESTAMPTZ(6),
    "origem" "public"."origem_da_usina" NOT NULL DEFAULT 'manual',
    "ordem_de_comissionamento_id" UUID,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usinas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."conferencias_de_plataforma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plataforma_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "dia" TIMESTAMPTZ(6) NOT NULL,
    "conferida_por_id" UUID,
    "conferida_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "print_chave" TEXT NOT NULL,
    "print_nome" TEXT NOT NULL,
    "print_tamanho" INTEGER NOT NULL,
    "print_tipo" TEXT NOT NULL,

    CONSTRAINT "conferencias_de_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."resultados_da_conferencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conferencia_id" UUID NOT NULL,
    "usina_id" UUID NOT NULL,
    "situacao" "public"."situacao_do_monitoramento" NOT NULL,
    "nota" TEXT,
    "ordem_de_servico_id" UUID,

    CONSTRAINT "resultados_da_conferencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plataformas_de_inversor_nome_key" ON "public"."plataformas_de_inversor"("nome");

CREATE INDEX "usinas_plataforma_id_company_id_ativa_idx" ON "public"."usinas"("plataforma_id", "company_id", "ativa");

CREATE INDEX "usinas_client_id_idx" ON "public"."usinas"("client_id");

CREATE INDEX "conferencias_de_plataforma_dia_idx" ON "public"."conferencias_de_plataforma"("dia");

CREATE UNIQUE INDEX "conferencias_de_plataforma_plataforma_id_company_id_dia_key" ON "public"."conferencias_de_plataforma"("plataforma_id", "company_id", "dia");

CREATE INDEX "resultados_da_conferencia_usina_id_idx" ON "public"."resultados_da_conferencia"("usina_id");

CREATE UNIQUE INDEX "resultados_da_conferencia_conferencia_id_usina_id_key" ON "public"."resultados_da_conferencia"("conferencia_id", "usina_id");

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_usina_id_fkey" FOREIGN KEY ("usina_id") REFERENCES "public"."usinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_plataforma_id_fkey" FOREIGN KEY ("plataforma_id") REFERENCES "public"."plataformas_de_inversor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_ordem_de_comissionamento_id_fkey" FOREIGN KEY ("ordem_de_comissionamento_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."usinas" ADD CONSTRAINT "usinas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."conferencias_de_plataforma" ADD CONSTRAINT "conferencias_de_plataforma_plataforma_id_fkey" FOREIGN KEY ("plataforma_id") REFERENCES "public"."plataformas_de_inversor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."conferencias_de_plataforma" ADD CONSTRAINT "conferencias_de_plataforma_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."conferencias_de_plataforma" ADD CONSTRAINT "conferencias_de_plataforma_conferida_por_id_fkey" FOREIGN KEY ("conferida_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."resultados_da_conferencia" ADD CONSTRAINT "resultados_da_conferencia_conferencia_id_fkey" FOREIGN KEY ("conferencia_id") REFERENCES "public"."conferencias_de_plataforma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."resultados_da_conferencia" ADD CONSTRAINT "resultados_da_conferencia_usina_id_fkey" FOREIGN KEY ("usina_id") REFERENCES "public"."usinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."resultados_da_conferencia" ADD CONSTRAINT "resultados_da_conferencia_ordem_de_servico_id_fkey" FOREIGN KEY ("ordem_de_servico_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.usinas
  ADD CONSTRAINT usinas_potencia_positiva CHECK (potencia_kwp > 0),
  ADD CONSTRAINT usinas_comissionamento_da_origem CHECK ((origem = 'comissionamento') = (ordem_de_comissionamento_id IS NOT NULL));
CREATE UNIQUE INDEX usinas_uma_ativa_por_uc_e_nome ON public.usinas (consumer_unit_id, lower(nome)) WHERE ativa;
ALTER TABLE public.conferencias_de_plataforma
  ADD CONSTRAINT conferencias_de_plataforma_print CHECK (print_tamanho > 0);
ALTER TABLE public.resultados_da_conferencia
  ADD CONSTRAINT resultados_da_conferencia_os_so_com_excecao CHECK (situacao <> 'normal' OR ordem_de_servico_id IS NULL);

INSERT INTO public.plataformas_de_inversor (id, nome, ordem, updated_at) VALUES
  ('livoltek', 'Livoltek', 1, now()), ('solarman', 'Solarman', 2, now()), ('solis', 'Solis', 3, now()),
  ('solax', 'Solax', 4, now()), ('goodwe', 'GoodWe', 5, now()), ('fusionsolar', 'FusionSolar', 6, now()),
  ('growatt', 'Growatt', 7, now()), ('solplanet', 'Solplanet', 8, now()), ('hypon-cloud', 'Hypon Cloud', 9, now())
ON CONFLICT (id) DO NOTHING;

DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['plataformas_de_inversor', 'usinas', 'conferencias_de_plataforma', 'resultados_da_conferencia'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.no_departamento(''engenharia-obras''))', tabela);
  END LOOP;
END $regime$;
GRANT SELECT, INSERT, UPDATE ON public.plataformas_de_inversor TO plugga_runtime;
GRANT SELECT, INSERT, UPDATE ON public.usinas TO plugga_runtime;
GRANT SELECT, INSERT ON public.conferencias_de_plataforma TO plugga_runtime;
GRANT SELECT, INSERT ON public.resultados_da_conferencia TO plugga_runtime;

-- Plataformas: o gerente da Engenharia com a tela de Usinas (ou a plataforma).
CREATE POLICY rls_inserir ON public.plataformas_de_inversor FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'], true));
CREATE POLICY rls_atualizar ON public.plataformas_de_inversor FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'], true)) WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'], true));
-- Usinas e conferências: quem tem a tela de Usinas.
CREATE POLICY rls_inserir ON public.usinas FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas']) AND criado_por_id = plugga_security.usuario_id());
CREATE POLICY rls_atualizar ON public.usinas FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'])) WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas']));
CREATE POLICY rls_inserir ON public.conferencias_de_plataforma FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas']) AND conferida_por_id = plugga_security.usuario_id());
CREATE POLICY rls_inserir ON public.resultados_da_conferencia FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'])
    AND EXISTS (SELECT 1 FROM public.conferencias_de_plataforma c WHERE c.id = conferencia_id AND c.conferida_por_id = plugga_security.usuario_id()));

-- A usina muda os dados, nunca o cliente, a UC, a empresa nem a origem.
CREATE FUNCTION plugga_security.usina_mantem_o_dono() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.company_id, NEW.client_id, NEW.consumer_unit_id, NEW.origem, NEW.ordem_de_comissionamento_id, NEW.created_at)
     IS DISTINCT FROM (OLD.company_id, OLD.client_id, OLD.consumer_unit_id, OLD.origem, OLD.ordem_de_comissionamento_id, OLD.created_at)
    OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL) THEN
    RAISE EXCEPTION 'empresa, cliente, UC e origem da usina não mudam';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.usina_mantem_o_dono() FROM PUBLIC;
CREATE TRIGGER usinas_mantem_o_dono BEFORE UPDATE ON public.usinas FOR EACH ROW EXECUTE FUNCTION plugga_security.usina_mantem_o_dono();

-- Nomes de clientes, UCs e pessoas: para qualquer tela da Engenharia, e também
-- os que aparecem numa usina ou numa conferência.
CREATE OR REPLACE FUNCTION plugga_security.clientes_para_engenharia(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.no_departamento('engenharia-obras')
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (
        EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.usinas u WHERE u.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.ucs_para_engenharia(clientes uuid[])
RETURNS TABLE(id uuid, client_id uuid, code text, distributor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code, u.distributor FROM public.consumer_units u
  JOIN public.clients c ON c.id = u.client_id
  WHERE plugga_security.no_departamento('engenharia-obras')
    AND u.client_id = ANY($1)
    AND (c.active
      OR EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.client_id = c.id)
      OR EXISTS (SELECT 1 FROM public.usinas s WHERE s.client_id = c.id))
  ORDER BY u.code
  LIMIT 500
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.pessoas_da_engenharia(alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.name FROM public.users u
  WHERE plugga_security.no_departamento('engenharia-obras')
    AND (
      ($1 IS NULL AND u.status = 'active' AND EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras'
        AND d.telas && ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
      OR ($1 IS NOT NULL AND u.id = ANY($1) AND (
        EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE u.id IN (o.tecnico_id, o.apoio_id, o.criado_por_id, o.laudo_por_id, o.adiada_por_id, o.cancelada_por_id))
        OR EXISTS (SELECT 1 FROM public.historico_de_ordens_de_servico h WHERE h.por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.arquivos_de_ordens_de_servico a WHERE a.enviado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.termos_de_ordens_de_servico t WHERE t.coletado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.configuracoes_de_tipo_de_ordem c WHERE u.id IN (c.agendador_id, c.atualizado_por_id))
        OR EXISTS (SELECT 1 FROM public.usinas s WHERE s.criado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.conferencias_de_plataforma f WHERE f.conferida_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras')))
    )
  ORDER BY u.name
$fn$;

COMMIT;
