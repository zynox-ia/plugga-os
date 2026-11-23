-- Cobrança manual (PLU-337, A7): para criar a cobrança de um cliente que ainda não
-- tem nenhuma, o Financeiro precisa confirmar que o cliente existe e está ativo.
-- A função de 20261123080000 passa a devolver, pelo id, também o cliente ativo
-- (antes, só o que já tinha lançamento). Continua só id e nome.
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.clientes_para_financeiro(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND (c.active OR EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.client_id = c.id)))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;

COMMIT;
