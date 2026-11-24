-- W3 (PLU-341), correção da fatia (a): a função da conta da compra diz se criou a conta
-- agora, para a aplicação gravar o evento `financeiro.lancamento.created` só nesse caso
-- (no retorno idempotente, não). O tipo de retorno muda, então é DROP e CREATE; o resto
-- é o da 20261124500900.
BEGIN;

DROP FUNCTION plugga_security.financeiro_conta_da_compra(uuid);

CREATE FUNCTION plugga_security.financeiro_conta_da_compra(p_pedido uuid) RETURNS TABLE(id uuid, criada boolean, company_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_usuario uuid := plugga_security.usuario_id();
  v_id uuid;
  v_pedido record;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CONTA_DA_COMPRA_SEM_SESSAO';
  END IF;
  SELECT l.id INTO v_id FROM public.lancamentos l WHERE l.pedido_de_compra_id = p_pedido;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false, (SELECT l.company_id FROM public.lancamentos l WHERE l.id = v_id);
    RETURN;
  END IF;
  SELECT p.company_id, p.numero, p.titulo, p.etapa, p.cancelado_em, p.aprovado_em, p.aprovou_id,
         c.fornecedor_id, c.valor + coalesce(c.valor_frete, 0) AS valor,
         (SELECT e.prazo_em FROM public.pedidos_de_compra_etapas e
           WHERE e.pedido_id = p.id AND e.etapa = 'pagamento' AND e.saiu_em IS NULL) AS prazo
    INTO v_pedido
    FROM public.pedidos_de_compra p
    JOIN public.cotacoes_de_compra c ON c.id = p.cotacao_selecionada_id
   WHERE p.id = p_pedido
   FOR UPDATE OF p;
  -- Só o pedido recém-aprovado, por quem o aprovou: é a própria aprovação que autoriza.
  IF NOT FOUND OR v_pedido.etapa <> 'pagamento' OR v_pedido.cancelado_em IS NOT NULL
     OR v_pedido.aprovado_em IS NULL OR v_pedido.aprovou_id IS DISTINCT FROM v_usuario THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTA_DA_COMPRA_SO_NA_APROVACAO';
  END IF;
  INSERT INTO public.lancamentos (
    tipo, company_id, fornecedor_id, categoria_id, conta_corrente_id, descricao, valor, vencimento,
    etapa, origem, pedido_de_compra_id, criado_por_id, aprovado_em, aprovado_por_id, updated_at
  ) VALUES (
    'saida', v_pedido.company_id, v_pedido.fornecedor_id, NULL, NULL,
    left(format('PC-%s · %s', lpad(v_pedido.numero::text, 4, '0'), v_pedido.titulo), 200),
    v_pedido.valor,
    -- O início do dia de Manaus, como todo vencimento.
    (date_trunc('day', coalesce(v_pedido.prazo, v_pedido.aprovado_em) AT TIME ZONE 'America/Manaus') AT TIME ZONE 'America/Manaus'),
    'aprovada', 'pedido_de_compra', p_pedido, v_usuario, v_pedido.aprovado_em, v_usuario, now()
  )
  RETURNING lancamentos.id INTO v_id;
  RETURN QUERY SELECT v_id, true, v_pedido.company_id::text;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.financeiro_conta_da_compra(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.financeiro_conta_da_compra(uuid) TO plugga_runtime;

COMMIT;
