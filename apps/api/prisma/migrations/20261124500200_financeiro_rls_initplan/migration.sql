-- RLS do Financeiro com a função de segurança dentro de (SELECT ...) (regra da
-- PLU-344, 5857ca7). Chamada direta no USING/WITH CHECK é avaliada por linha; dentro
-- do subselect, sem coluna da linha, vira InitPlan e roda uma vez por comando. A regra
-- que depende do tipo do lançamento compara a coluna fora e deixa a função dentro.
-- As tabelas filhas (anexos, histórico, UCs, envios ao OMIE) passam pelo RLS de
-- `lancamentos` no EXISTS e ganham junto. Mesmas regras de antes.
BEGIN;

DROP POLICY rls_ler ON public.lancamentos;
DROP POLICY rls_inserir ON public.lancamentos;
DROP POLICY rls_atualizar ON public.lancamentos;
CREATE POLICY rls_ler ON public.lancamentos FOR SELECT TO plugga_runtime USING (
  (tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao'])))
  OR (tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao']))));
CREATE POLICY rls_inserir ON public.lancamentos FOR INSERT TO plugga_runtime WITH CHECK (
  (tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar'])))
  OR (tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.receber']))));
CREATE POLICY rls_atualizar ON public.lancamentos FOR UPDATE TO plugga_runtime
  USING ((tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao'])))
    OR (tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao']))))
  WITH CHECK ((tipo = 'saida' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao'])))
    OR (tipo = 'entrada' AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao']))));

DROP POLICY rls_ler ON public.categorias_financeiras;
CREATE POLICY rls_ler ON public.categorias_financeiras FOR SELECT TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])));
DROP POLICY rls_ler ON public.contas_correntes;
CREATE POLICY rls_ler ON public.contas_correntes FOR SELECT TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])));

DROP POLICY rls_gerir ON public.omie_conexoes;
CREATE POLICY rls_gerir ON public.omie_conexoes TO plugga_runtime
  USING ((SELECT plugga_security.plataforma() OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)))
  WITH CHECK ((SELECT plugga_security.plataforma() OR plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true)));

COMMIT;
