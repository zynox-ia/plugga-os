-- Quantos itens de pedido de compra apontam para um item de estoque (PLU-332,
-- auditoria de 27/11/2026, S2 4 e S4).
--
-- A empresa do item só muda enquanto ele não tem movimentação nem pedido
-- vinculado. Quem só tem a tela de Estoque não lê itens_de_pedido (a leitura
-- é de Compras, do Financeiro e da Engenharia na própria O.S.), então a
-- contagem feita pelo login dele dava zero e a troca passava. Esta função
-- devolve só o número, a quem pode ler o item. Sem a tela, devolve NULL (não
-- zero): quem chama trata o desconhecido como "tem vínculo" e recusa.

BEGIN;

CREATE FUNCTION plugga_security.vinculos_do_item_de_estoque(alvo_item uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
    WHEN plugga_security.tem_tela(ARRAY['suprimentos.estoque', 'suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      THEN (SELECT count(*)::integer FROM public.itens_de_pedido ip WHERE ip.item_de_estoque_id = $1)
  END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.vinculos_do_item_de_estoque(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.vinculos_do_item_de_estoque(uuid) TO plugga_runtime;

COMMIT;
