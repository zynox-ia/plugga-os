-- Escopo por ação dos agentes (B-01 mínimo) e entrada de O.S. pelo robô (PLU-351).
--
--   * agent_identities.acoes: ações concedidas, do catálogo `acoesDeAgente` de
--     packages/shared; vazia por padrão (nenhum agente atual ganha nada);
--   * pedidos_de_agente: chave de idempotência por agente, só por inserção;
--   * O.S. com o grupo e quem pediu no canal (só na origem robô);
--   * agente cria O.S. só com a ação engenharia.ordem.criar e a origem robô;
--   * a trilha do agente (agent_actions) aceita a O.S. que ele criou;
--   * chave natural (código da UC ou documento) resolvida só em ids.
-- Políticas novas com as funções de segurança em (SELECT ...) (InitPlan).

BEGIN;

ALTER TABLE "public"."agent_identities" ADD COLUMN     "acoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "public"."ordens_de_servico" ADD COLUMN     "origem_grupo" TEXT,
ADD COLUMN     "origem_solicitante" TEXT;

CREATE TABLE "public"."pedidos_de_agente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_user_id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "hash_do_corpo" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_de_agente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedidos_de_agente_agent_user_id_chave_key" ON "public"."pedidos_de_agente"("agent_user_id", "chave");

ALTER TABLE "public"."pedidos_de_agente" ADD CONSTRAINT "pedidos_de_agente_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "public"."agent_identities"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.agent_identities ALTER COLUMN acoes SET NOT NULL;
-- Catálogo das ações (a mesma lista de `acoesDeAgente`), sem nulos nem repetidas.
CREATE FUNCTION plugga_security.acoes_coerentes(p_acoes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $1 IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest($1) a WHERE a IS NULL)
    AND cardinality($1) = (SELECT count(DISTINCT a) FROM unnest($1) a)
    AND $1 <@ ARRAY['engenharia.ordem.criar']::text[]
$fn$;
REVOKE ALL ON FUNCTION plugga_security.acoes_coerentes(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.acoes_coerentes(text[]) TO plugga_auth_runtime;
ALTER TABLE public.agent_identities ADD CONSTRAINT agent_identities_acoes_do_catalogo CHECK (plugga_security.acoes_coerentes(acoes));
ALTER TABLE public.ordens_de_servico
  ADD CONSTRAINT ordens_de_servico_origem_do_robo CHECK (origem = 'robo' OR (origem_grupo IS NULL AND origem_solicitante IS NULL)),
  ADD CONSTRAINT ordens_de_servico_origem_do_robo_curta CHECK (length(origem_grupo) <= 120 AND length(origem_solicitante) <= 120);
ALTER TABLE public.pedidos_de_agente
  ADD CONSTRAINT pedidos_de_agente_chave CHECK (chave ~ '^[A-Za-z0-9_.:-]{8,120}$'),
  ADD CONSTRAINT pedidos_de_agente_hash CHECK (hash_do_corpo ~ '^[0-9a-f]{64}$');

-- As ações do agente da requisição (vazio para pessoa ou sem agente).
CREATE FUNCTION plugga_security.acoes_do_agente() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT coalesce((SELECT a.acoes FROM public.agent_identities a WHERE a.user_id = plugga_security.agente_id()), ARRAY[]::text[])
$fn$;
REVOKE ALL ON FUNCTION plugga_security.acoes_do_agente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.acoes_do_agente() TO plugga_runtime;

ALTER TABLE public.pedidos_de_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_de_agente FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_de_agente FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
DO $dono$ BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.pedidos_de_agente FOR SELECT TO %I USING (true)', current_user);
END $dono$;
GRANT SELECT, INSERT ON public.pedidos_de_agente TO plugga_runtime;
CREATE POLICY rls_agente_ler ON public.pedidos_de_agente FOR SELECT TO plugga_runtime
  USING (agent_user_id = (SELECT plugga_security.agente_id()));
CREATE POLICY rls_agente_inserir ON public.pedidos_de_agente FOR INSERT TO plugga_runtime
  WITH CHECK (agent_user_id = (SELECT plugga_security.agente_id()) AND ARRAY[acao] <@ (SELECT plugga_security.acoes_do_agente()));

-- Pessoa cria O.S. com a tela; agente, só pela entrada do robô e com a ação.
DROP POLICY rls_inserir ON public.ordens_de_servico;
CREATE POLICY rls_inserir ON public.ordens_de_servico FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
    AND ((SELECT plugga_security.agente_id()) IS NULL
      OR (origem = 'robo' AND ARRAY['engenharia.ordem.criar'] <@ (SELECT plugga_security.acoes_do_agente()))));

-- A trilha do agente aceita a O.S. que ele mesmo criou.
CREATE OR REPLACE FUNCTION plugga_security.entidade_do_agente(tipo text, alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE $1
    WHEN 'client' THEN plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id::text = $2)
    WHEN 'deal' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id::text = $2)
    WHEN 'opportunity' THEN plugga_security.tem_tela(ARRAY['crm.pipelines']) AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id::text = $2)
    WHEN 'contract' THEN plugga_security.tem_tela(ARRAY['crm.contratos']) AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.id::text = $2)
    WHEN 'ordem_de_servico' THEN plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
      AND EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.id::text = $2 AND o.criado_por_id = plugga_security.agente_id())
    ELSE false END
$fn$;

-- Chave natural do pedido: a UC pelo código (só os dígitos) ou o cliente pelo
-- documento. Devolve só ids; o documento não sai daqui.
CREATE FUNCTION plugga_security.chave_natural_para_engenharia(documento text, codigo_uc text)
RETURNS TABLE(client_id uuid, uc_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, u.id FROM public.consumer_units u JOIN public.clients c ON c.id = u.client_id
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND $2 IS NOT NULL AND length(regexp_replace($2, '\D', '', 'g')) >= 3
    AND regexp_replace(u.code, '\D', '', 'g') = regexp_replace($2, '\D', '', 'g')
    AND c.active AND ($1 IS NULL OR c.document = $1)
  UNION ALL
  SELECT c.id, NULL::uuid FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND $2 IS NULL AND $1 IS NOT NULL AND c.active AND c.document = $1
  LIMIT 5
$fn$;
REVOKE ALL ON FUNCTION plugga_security.chave_natural_para_engenharia(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.chave_natural_para_engenharia(text, text) TO plugga_runtime;

COMMIT;
