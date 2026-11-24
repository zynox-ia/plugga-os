-- W3 (PLU-341), fatia (c): cancelar o pedido de compra aprovado cancela a conta a pagar
-- dele, com o mesmo motivo, na mesma transação.
--
-- Quem cancela em Compras não precisa ter o Financeiro (o RLS de `lancamentos` é dele):
-- a conta é cancelada por esta função, que só age para quem acabou de cancelar o pedido.
-- A conta já paga (ou conciliada) fica como está: o dinheiro saiu, e o estorno é do
-- Financeiro. O Financeiro, por sua vez, recusa cancelar a conta de um pedido (na API).
--
-- O reflexo do cancelamento no OMIE também passa a ser por uma função, do conector, para
-- valer com o RLS de qualquer quem chame: descarta o que não saiu e, se a conta já chegou
-- ao OMIE e a empresa está conectada, pede o cancelamento lá. Mesma regra de antes.
BEGIN;

CREATE FUNCTION plugga_security.financeiro_cancelar_conta_da_compra(p_pedido uuid, p_motivo text)
RETURNS TABLE(id uuid, company_id text, etapa public.financeiro_etapa)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_usuario uuid := plugga_security.usuario_id();
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CANCELAMENTO_DA_COMPRA_SEM_SESSAO';
  END IF;
  -- Só o pedido recém-cancelado, por quem o cancelou: é o próprio cancelamento que autoriza.
  IF NOT EXISTS (SELECT 1 FROM public.pedidos_de_compra p
      WHERE p.id = p_pedido AND p.cancelado_em IS NOT NULL AND p.cancelado_por_id = v_usuario) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CANCELAMENTO_DA_COMPRA_SO_COM_O_PEDIDO';
  END IF;
  RETURN QUERY
    UPDATE public.lancamentos l
       SET cancelado_em = now(), cancelado_por_id = v_usuario, cancelamento_motivo = p_motivo
     WHERE l.pedido_de_compra_id = p_pedido AND l.cancelado_em IS NULL AND l.etapa IN ('aberta', 'aprovada')
    RETURNING l.id, l.company_id, l.etapa;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.financeiro_cancelar_conta_da_compra(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.financeiro_cancelar_conta_da_compra(uuid, text) TO plugga_runtime;

-- ------------------------------------------------------------ o conector do OMIE

-- FORCE RLS vale para o dono, que é quem roda a função: só o pedido de cancelamento.
DO $dono$
BEGIN
  EXECUTE format($p$CREATE POLICY rls_conector_owner_insert ON public.omie_envios FOR INSERT TO %I
    WITH CHECK (operacao = 'cancelar')$p$, current_user);
END $dono$;

-- `p_conectado` vem do conector, que pergunta à `omie_conectado` (ou ao dublê, nos testes).
CREATE FUNCTION plugga_security.omie_reflexo_do_cancelamento(p_lancamento uuid, p_conectado boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_empresa text;
  v_chegou boolean;
BEGIN
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
  IF v_chegou AND p_conectado THEN
    INSERT INTO public.omie_envios (lancamento_id, company_id, operacao, criado_por_id)
    VALUES (p_lancamento, v_empresa, 'cancelar', plugga_security.usuario_id());
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_reflexo_do_cancelamento(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.omie_reflexo_do_cancelamento(uuid, boolean) TO plugga_runtime;

COMMIT;
