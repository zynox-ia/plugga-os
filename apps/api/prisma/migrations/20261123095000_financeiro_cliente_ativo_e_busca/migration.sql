-- Revisão do f84ec5e (PLU-337):
--
-- 1. A busca da clientes_para_financeiro voltou a escapar a barra invertida
--    (`'\', '\\'`), como nas outras versões; a 20261123094000 trocava \ por \ e um
--    "\" na busca escapava o caractere seguinte do ILIKE.
-- 2. A criação da cobrança confere o cliente ATIVO por uma função própria. A
--    clientes_para_financeiro devolve pelo id também o cliente que já tem
--    lançamento (para mostrar o nome dele), então não servia para essa checagem.
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.clientes_para_financeiro(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (c.active OR EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;

-- Só para criar a cobrança: o cliente existe e está ativo. Devolve só sim ou não.
CREATE FUNCTION plugga_security.cliente_ativo_para_financeiro(p_cliente uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.tem_tela(ARRAY['financeiro.receber'])
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = $1 AND c.active)
$fn$;
REVOKE ALL ON FUNCTION plugga_security.cliente_ativo_para_financeiro(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.cliente_ativo_para_financeiro(uuid) TO plugga_runtime;

COMMIT;
