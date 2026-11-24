-- Configurações da Engenharia (PLU-349): o prazo padrão de cada tipo de O.S.,
-- em dias úteis (feriado conta como dia útil), que sugere o prazo da Nova O.S.,
-- e quem agenda. Sem linha, vale o padrão do código. Lê quem é da Engenharia;
-- muda o gerente da Engenharia ou a plataforma. Nada se apaga.

BEGIN;

CREATE TABLE "public"."configuracoes_de_tipo_de_ordem" (
    "tipo" "public"."tipo_de_ordem_de_servico" NOT NULL,
    "prazo_padrao_dias_uteis" INTEGER NOT NULL,
    "agendador_id" UUID,
    "atualizado_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracoes_de_tipo_de_ordem_pkey" PRIMARY KEY ("tipo")
);

ALTER TABLE "public"."configuracoes_de_tipo_de_ordem" ADD CONSTRAINT "configuracoes_de_tipo_de_ordem_agendador_id_fkey" FOREIGN KEY ("agendador_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."configuracoes_de_tipo_de_ordem" ADD CONSTRAINT "configuracoes_de_tipo_de_ordem_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.configuracoes_de_tipo_de_ordem
  ADD CONSTRAINT configuracoes_de_tipo_de_ordem_prazo CHECK (prazo_padrao_dias_uteis BETWEEN 0 AND 30);

ALTER TABLE public.configuracoes_de_tipo_de_ordem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_de_tipo_de_ordem FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.configuracoes_de_tipo_de_ordem FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
DO $dono$ BEGIN
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.configuracoes_de_tipo_de_ordem FOR SELECT TO %I USING (true)', current_user);
END $dono$;
GRANT SELECT, INSERT, UPDATE ON public.configuracoes_de_tipo_de_ordem TO plugga_runtime;

CREATE POLICY rls_ler ON public.configuracoes_de_tipo_de_ordem FOR SELECT TO plugga_runtime
  USING (plugga_security.no_departamento('engenharia-obras'));
-- Mudar é do gerente da Engenharia (ou da plataforma, que tem_tela já inclui).
CREATE POLICY rls_inserir ON public.configuracoes_de_tipo_de_ordem FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'], true)
    AND atualizado_por_id = plugga_security.usuario_id());
CREATE POLICY rls_atualizar ON public.configuracoes_de_tipo_de_ordem FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'], true))
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'], true)
    AND atualizado_por_id = plugga_security.usuario_id());

-- Quem agenda e quem mudou a configuração entram nos nomes da Engenharia.
CREATE OR REPLACE FUNCTION plugga_security.pessoas_da_engenharia(alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.name FROM public.users u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND (
      ($1 IS NULL AND u.status = 'active' AND EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras'
        AND d.telas && ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
      OR ($1 IS NOT NULL AND u.id = ANY($1) AND (
        EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE u.id IN (o.tecnico_id, o.apoio_id, o.criado_por_id, o.laudo_por_id, o.adiada_por_id, o.cancelada_por_id))
        OR EXISTS (SELECT 1 FROM public.historico_de_ordens_de_servico h WHERE h.por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.arquivos_de_ordens_de_servico a WHERE a.enviado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.termos_de_ordens_de_servico t WHERE t.coletado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.configuracoes_de_tipo_de_ordem c WHERE u.id IN (c.agendador_id, c.atualizado_por_id))
        OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras')))
    )
  ORDER BY u.name
$fn$;

COMMIT;
