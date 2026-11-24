-- Autentique conectada pela tela, uma conta por empresa: token e modo de testes
-- moram cifrados em `segredos_do_sistema` (chave lógica
-- `integracao.autentique.<empresa>`, já só do desenvolvedor pela política
-- `rls_segredos`). Quem USA a conta (um contrato a assinar, o retorno de um
-- webhook) não alcança a tabela: recebe só o texto cifrado de UMA empresa, por
-- esta função. A chave-mestra continua só no ambiente da API, então nem o banco
-- nem a função bastam para ler o token. Empresa fora da lista não devolve nada.
BEGIN;

CREATE FUNCTION plugga_security.config_autentique(p_empresa text) RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE p_empresa IN ('plugga', 'waze') AND s.chave = 'integracao.autentique.' || p_empresa
$fn$;

REVOKE ALL ON FUNCTION plugga_security.config_autentique(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.config_autentique(text) TO plugga_runtime, plugga_jobs_runtime;

COMMIT;
