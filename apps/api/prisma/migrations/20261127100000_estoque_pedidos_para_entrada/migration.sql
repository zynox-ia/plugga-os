-- Entrada manual ligada a pedido de compra para quem só tem a tela de Estoque
-- (PLU-332/333, auditoria de 27/11/2026, S2 1).
--
-- O limite da entrada ("não entra mais do que o pedido pediu deste item") e a
-- lista de pedidos do registro de movimentação precisam da quantidade pedida
-- do item. Ela está em itens_de_pedido, cuja leitura continua só de Compras,
-- Financeiro e da Engenharia na própria O.S.: abrir a tabela inteira ao Estoque
-- mostraria descrição, valores e demais linhas do pedido, que não são dele.
--
-- Esta função entrega só o mínimo, por item de estoque: os pedidos da mesma
-- empresa que têm linha vinculada ao item, com número, título, etapa, se está
-- cancelado ou atendido pelo estoque, o total pedido do item (somando as
-- linhas) e o total que já entrou por compra ligado ao pedido. Lê quem pode
-- registrar a movimentação (as mesmas telas da política de inserção dela).

BEGIN;

CREATE FUNCTION plugga_security.pedidos_para_entrada_do_item(alvo_item uuid, alvo_pedido uuid)
RETURNS TABLE(id uuid, numero integer, titulo text, etapa text, cancelado boolean, atendido_pelo_estoque boolean, pedida numeric, recebida numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p.id, p.numero, p.titulo, p.etapa::text,
    p.cancelado_em IS NOT NULL,
    p.origem_atendimento IS NOT NULL AND p.origem_atendimento::text = 'estoque',
    sum(ip.quantidade),
    COALESCE((SELECT sum(m.quantidade) FROM public.movimentacoes_de_estoque m
      WHERE m.pedido_id = p.id AND m.item_id = $1 AND m.tipo = 'entrada' AND m.origem = 'compra'), 0)
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
