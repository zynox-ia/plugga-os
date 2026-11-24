-- W3 (PLU-341), fatia (a): o pedido de compra aprovado vira conta a pagar.
--
-- Quem aprova em Compras não precisa ter o Financeiro, e o RLS de `lancamentos` é do
-- Financeiro. Por isso a conta nasce por esta função, que deriva tudo do próprio pedido
-- (nada vem da aplicação) e só age para quem acabou de aprová-lo, na mesma transação:
--   - empresa, fornecedor e valor da cotação vencedora (com o frete);
--   - vencimento no fim do prazo da etapa de pagamento (o SLA de Compras);
--   - já aprovada, sem categoria (CC14: o Financeiro classifica) e sem conta corrente;
--   - um lançamento por pedido (a chave única de `pedido_de_compra_id`): chamar de novo
--     devolve o que já existe.
-- Sem categoria, nada vai ao OMIE até a classificação (20261124500800).
--
-- O centro de custo (CC4) vem depois: o vínculo com o pedido já leva à obra dele.
BEGIN;

-- FORCE RLS vale para o dono, que é quem roda a função: só a conta da compra.
DO $dono$
BEGIN
  EXECUTE format($p$CREATE POLICY rls_compra_owner_insert ON public.lancamentos FOR INSERT TO %I
    WITH CHECK (origem = 'pedido_de_compra' AND pedido_de_compra_id IS NOT NULL)$p$, current_user);
END $dono$;

CREATE FUNCTION plugga_security.financeiro_conta_da_compra(p_pedido uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
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
    RETURN v_id;
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
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.financeiro_conta_da_compra(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.financeiro_conta_da_compra(uuid) TO plugga_runtime;

-- A conta de cada pedido, para a ficha de Compras: só o mínimo, para quem vê Compras
-- ou o Financeiro (quem só tem Compras não lê `lancamentos`).
CREATE FUNCTION plugga_security.contas_a_pagar_dos_pedidos(alvos uuid[])
RETURNS TABLE(pedido_id uuid, id uuid, numero integer, etapa public.financeiro_etapa, cancelado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT l.pedido_de_compra_id, l.id, l.numero, l.etapa, l.cancelado_em IS NOT NULL
  FROM public.lancamentos l
  WHERE l.pedido_de_compra_id = ANY($1)
    AND (SELECT plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.conciliacao']))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.contas_a_pagar_dos_pedidos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.contas_a_pagar_dos_pedidos(uuid[]) TO plugga_runtime;

-- O pedido de cada conta, para a ficha do Financeiro: número e valor original (o da
-- cotação vencedora, que criou a conta). Quem só tem o Financeiro não lê Compras.
CREATE FUNCTION plugga_security.pedidos_das_contas(alvos uuid[])
RETURNS TABLE(id uuid, numero integer, valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p.id, p.numero, c.valor + coalesce(c.valor_frete, 0)
  FROM public.pedidos_de_compra p
  JOIN public.cotacoes_de_compra c ON c.id = p.cotacao_selecionada_id
  WHERE p.id = ANY($1)
    AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.pedido_de_compra_id = p.id)
    AND (SELECT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.conciliacao', 'suprimentos.compras']))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.pedidos_das_contas(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.pedidos_das_contas(uuid[]) TO plugga_runtime;

COMMIT;
