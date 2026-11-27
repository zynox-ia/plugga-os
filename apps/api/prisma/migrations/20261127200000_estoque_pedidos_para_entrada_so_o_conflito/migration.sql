-- Pedidos para a entrada por compra: só o sinal de conflito de unidade
-- (PLU-332, revisão da leva 13).
--
-- 20261127180000 passou a devolver os rótulos de unidade das linhas do item e
-- a unidade do item, para a aplicação comparar. Quem só tem a tela de Estoque
-- não precisa ver os rótulos das linhas do pedido: basta saber se alguma linha
-- do item está em outra unidade. A comparação vai para o banco, numa função
-- com o mesmo critério do contrato (`unidadeDaLinhaConflita` em
-- packages/shared/src/estoque.ts): tira só os espaços ASCII das pontas,
-- normaliza o Unicode (NFC) e compara exato; linha sem unidade não conflita.

BEGIN;

CREATE FUNCTION plugga_security.unidade_conflita(unidade_da_linha text, unidade_do_item text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT COALESCE(normalize(btrim($1, E' \t\n\r\f\v'), NFC), '') <> ''
    AND normalize(btrim($1, E' \t\n\r\f\v'), NFC) <> normalize(btrim($2, E' \t\n\r\f\v'), NFC)
$fn$;
REVOKE ALL ON FUNCTION plugga_security.unidade_conflita(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.unidade_conflita(text, text) TO plugga_runtime;

DROP FUNCTION plugga_security.pedidos_para_entrada_do_item(uuid, uuid);

CREATE FUNCTION plugga_security.pedidos_para_entrada_do_item(alvo_item uuid, alvo_pedido uuid)
RETURNS TABLE(id uuid, numero integer, titulo text, etapa text, cancelado boolean, atendido_pelo_estoque boolean, pedida numeric, recebida numeric, unidade_em_conflito boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p.id, p.numero, p.titulo, p.etapa::text,
    p.cancelado_em IS NOT NULL,
    p.origem_atendimento IS NOT NULL AND p.origem_atendimento::text = 'estoque',
    sum(ip.quantidade),
    COALESCE((SELECT sum(m.quantidade) FROM public.movimentacoes_de_estoque m
      WHERE m.pedido_id = p.id AND m.item_id = $1 AND m.tipo = 'entrada' AND m.origem = 'compra'), 0),
    bool_or(plugga_security.unidade_conflita(ip.unidade, i.unidade))
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
