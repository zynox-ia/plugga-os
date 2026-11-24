-- OMIE conectado pela tela: chave e segredo do app moram cifrados em
-- `segredos_do_sistema` (chave lógica `integracao.omie`, já só do desenvolvedor
-- pela política `rls_segredos`). Quem USA a conta (um pedido a faturar, uma nota a
-- emitir) não alcança a tabela: recebe só o texto cifrado, por esta função. A
-- chave-mestra continua só no ambiente da API, então nem o banco nem a função
-- bastam para ler o segredo.
BEGIN;

CREATE FUNCTION plugga_security.config_omie() RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE s.chave = 'integracao.omie'
$fn$;

REVOKE ALL ON FUNCTION plugga_security.config_omie() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.config_omie() TO plugga_runtime, plugga_jobs_runtime;

COMMIT;
