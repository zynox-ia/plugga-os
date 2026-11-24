-- W3 (PLU-341), revisão da fatia (c):
--
-- 1. O cancelamento da conta da compra atualizava `lancamentos` pela política de dono
--    `rls_omie_owner_update`, que é do gatilho do estado no OMIE e sai na contração do
--    S2. Com ela fora, o cancelamento falharia em silêncio (o UPDATE não alcançaria a
--    linha). A conta da compra ganha a política de dono própria e estreita.
-- 2. O reflexo do cancelamento no OMIE deixa de receber se a empresa está conectada:
--    calcula pela `omie_conectado`, como o resto do conector, e só atende quem tem o
--    Financeiro ou Compras na sessão (os dois lados que cancelam uma conta).
BEGIN;

DO $dono$
BEGIN
  EXECUTE format($p$CREATE POLICY rls_compra_owner_update ON public.lancamentos FOR UPDATE TO %I
    USING (origem = 'pedido_de_compra') WITH CHECK (origem = 'pedido_de_compra')$p$, current_user);
END $dono$;

DROP FUNCTION plugga_security.omie_reflexo_do_cancelamento(uuid, boolean);

CREATE FUNCTION plugga_security.omie_reflexo_do_cancelamento(p_lancamento uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_empresa text;
  v_chegou boolean;
BEGIN
  IF NOT (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'suprimentos.compras'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'REFLEXO_DO_CANCELAMENTO_SEM_ACESSO';
  END IF;
  SELECT l.company_id INTO v_empresa FROM public.lancamentos l WHERE l.id = p_lancamento AND l.cancelado_em IS NOT NULL;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REFLEXO_DO_CANCELAMENTO_SO_DE_CANCELADO';
  END IF;
  -- Só vai ao OMIE se a conta já chegou lá ou está saindo.
  v_chegou := EXISTS (SELECT 1 FROM public.omie_envios e
    WHERE e.lancamento_id = p_lancamento AND e.operacao = 'upsert' AND e.estado IN ('enviado', 'enviando'));
  -- O que ainda está em aberto é descartado, com o conector ligado ou não.
  UPDATE public.omie_envios e SET estado = 'descartado'
   WHERE e.lancamento_id = p_lancamento AND e.estado IN ('pendente', 'erro');
  IF v_chegou AND plugga_security.omie_conectado(v_empresa) THEN
    INSERT INTO public.omie_envios (lancamento_id, company_id, operacao, criado_por_id)
    VALUES (p_lancamento, v_empresa, 'cancelar', plugga_security.usuario_id());
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_reflexo_do_cancelamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.omie_reflexo_do_cancelamento(uuid) TO plugga_runtime;

COMMIT;
