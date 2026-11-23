-- Importação das usinas (PLU-347, revisão): os clientes da planilha são
-- procurados em lote e pelo nome exato (sem diferenciar maiúsculas e espaços
-- nas pontas), em vez de um ILIKE por nome com LIMIT 50. Só id e nome, de
-- clientes ativos, para quem é da Engenharia. As UCs dos clientes da planilha
-- (até 2000 linhas, várias UCs por cliente) cabem numa consulta: o teto sobe para 5000.

BEGIN;

CREATE FUNCTION plugga_security.clientes_para_engenharia_por_nome(nomes text[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.no_departamento('engenharia-obras')
    AND c.active
    AND lower(trim(c.name)) = ANY (SELECT lower(trim(n)) FROM unnest($1) AS n)
  LIMIT 5000
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_para_engenharia_por_nome(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_para_engenharia_por_nome(text[]) TO plugga_runtime;

CREATE OR REPLACE FUNCTION plugga_security.ucs_para_engenharia(clientes uuid[])
RETURNS TABLE(id uuid, client_id uuid, code text, distributor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code, u.distributor FROM public.consumer_units u
  JOIN public.clients c ON c.id = u.client_id
  WHERE plugga_security.no_departamento('engenharia-obras')
    AND u.client_id = ANY($1)
    AND (c.active
      OR EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.client_id = c.id)
      OR EXISTS (SELECT 1 FROM public.usinas s WHERE s.client_id = c.id))
  ORDER BY u.code
  LIMIT 5000
$fn$;

COMMIT;
