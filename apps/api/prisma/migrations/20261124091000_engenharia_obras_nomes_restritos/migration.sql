-- Obras (PLU-350, revisão): o nome do cliente sai só para os clientes que têm
-- obra, como nas funções de nome das O.S. e dos protocolos. A busca do cliente
-- para a Nova obra continua pela função da Engenharia, que exige o texto.

CREATE OR REPLACE FUNCTION plugga_security.nomes_das_obras(clientes uuid[], pessoas uuid[])
RETURNS TABLE(tipo text, id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT 'cliente', c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.obras']) AND c.id = ANY($1)
    AND EXISTS (SELECT 1 FROM public.obras o WHERE o.client_id = c.id)
  UNION ALL
  SELECT 'pessoa', u.id, u.name FROM public.users u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.obras']) AND u.id = ANY($2)
    AND (EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras')
      OR EXISTS (SELECT 1 FROM public.obras o WHERE o.criado_por_id = u.id OR o.responsavel_id = u.id))
$fn$;
