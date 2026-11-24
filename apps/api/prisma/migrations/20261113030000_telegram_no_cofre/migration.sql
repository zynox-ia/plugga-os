-- Telegram conectado pela tela: token, chat e avisos ligados moram cifrados em
-- `segredos_do_sistema` (chave lógica `integracao.telegram`, já só do
-- desenvolvedor pela política `rls_segredos`). Quem AVISA é qualquer requisição
-- (um lead novo) ou uma rotina; nenhuma alcança a tabela. Recebem só o texto
-- cifrado, por esta função. A chave-mestra continua só no ambiente da API, então
-- nem o banco nem a função bastam para ler o token.
BEGIN;

CREATE FUNCTION plugga_security.config_telegram() RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE s.chave = 'integracao.telegram'
$fn$;

REVOKE ALL ON FUNCTION plugga_security.config_telegram() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.config_telegram() TO plugga_runtime, plugga_jobs_runtime;

COMMIT;
