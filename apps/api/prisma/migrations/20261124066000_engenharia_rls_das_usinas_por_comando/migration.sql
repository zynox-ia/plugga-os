-- RLS das usinas avaliado uma vez por comando (PLU-347, CI): a importação de
-- 2000 linhas pagava, em cada linha, tem_tela + usuario_id (sessão, usuário e
-- departamentos) no WITH CHECK e no_departamento no RETURNING. As funções de
-- segurança são STABLE e não dependem da linha: dentro de um (SELECT ...) o
-- Postgres as avalia como InitPlan, uma vez por comando. As regras não mudam.

BEGIN;

DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['plataformas_de_inversor', 'usinas', 'conferencias_de_plataforma', 'resultados_da_conferencia'] LOOP
    EXECUTE format('DROP POLICY rls_ler ON public.%I', tabela);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING ((SELECT plugga_security.no_departamento(''engenharia-obras'')))', tabela);
  END LOOP;
END $regime$;

DROP POLICY rls_inserir ON public.usinas;
CREATE POLICY rls_inserir ON public.usinas FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'])) AND criado_por_id = (SELECT plugga_security.usuario_id()));
DROP POLICY rls_atualizar ON public.usinas;
CREATE POLICY rls_atualizar ON public.usinas FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.usinas']))) WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.usinas'])));
DROP POLICY rls_inserir ON public.resultados_da_conferencia;
CREATE POLICY rls_inserir ON public.resultados_da_conferencia FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.usinas']))
    AND EXISTS (SELECT 1 FROM public.conferencias_de_plataforma c WHERE c.id = conferencia_id AND c.conferida_por_id = (SELECT plugga_security.usuario_id())));

COMMIT;
