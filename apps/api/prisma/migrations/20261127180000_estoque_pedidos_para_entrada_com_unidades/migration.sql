-- Pedidos para a entrada por compra com as unidades das linhas (PLU-332,
-- revisão da leva 9).
--
-- A entrada manual ligada ao pedido usava o total das linhas do item sem olhar
-- a unidade: uma linha antiga de "4 cx" vinculada a um item em metros oferecia
-- 4 m para entrada, embora a reserva e o recebimento recusem essa linha. A
-- função passa a devolver também as unidades (distintas) das linhas do item e
-- a unidade do item, e a aplicação aplica o mesmo critério da cobertura.
-- O resto da definição é o de 20261127100000_estoque_pedidos_para_entrada; a
-- troca do tipo de retorno exige recriar a função.

BEGIN;

DROP FUNCTION plugga_security.pedidos_para_entrada_do_item(uuid, uuid);

CREATE FUNCTION plugga_security.pedidos_para_entrada_do_item(alvo_item uuid, alvo_pedido uuid)
RETURNS TABLE(id uuid, numero integer, titulo text, etapa text, cancelado boolean, atendido_pelo_estoque boolean, pedida numeric, recebida numeric, unidades text[], unidade_do_item text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p.id, p.numero, p.titulo, p.etapa::text,
    p.cancelado_em IS NOT NULL,
    p.origem_atendimento IS NOT NULL AND p.origem_atendimento::text = 'estoque',
    sum(ip.quantidade),
    COALESCE((SELECT sum(m.quantidade) FROM public.movimentacoes_de_estoque m
      WHERE m.pedido_id = p.id AND m.item_id = $1 AND m.tipo = 'entrada' AND m.origem = 'compra'), 0),
    COALESCE(array_agg(DISTINCT ip.unidade) FILTER (WHERE ip.unidade IS NOT NULL), ARRAY[]::text[]),
    min(i.unidade)
  FROM public.itens_de_pedido ip
  JOIN public.pedidos_de_compra p ON p.id = ip.pedido_id
  JOIN public.itens_de_estoque i ON i.id = ip.item_de_estoque_id
  WHERE ip.item_de_estoque_id = $1
    AND p.company_id = i.company_id
    AND ($2 IS NULL OR p.id = $2)
    AND plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
  GROUP BY p.id
  ORDER BY p.numero DESC
$fn$;
REVOKE ALL ON FUNCTION plugga_security.pedidos_para_entrada_do_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.pedidos_para_entrada_do_item(uuid, uuid) TO plugga_runtime;

COMMIT;
