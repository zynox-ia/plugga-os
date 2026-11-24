-- Credenciais do app OAuth do Google (client id e client secret) moram cifradas
-- em `segredos_do_sistema` (chave lógica `google.oauth`). Quem cadastra é o
-- desenvolvedor, mas quem as USA é qualquer pessoa logada que conecta a própria
-- agenda: o consentimento e a troca do código rodam no pool da aplicação, no
-- contexto dessa pessoa, que não alcança a tabela. Ela recebe só o texto
-- cifrado, por esta função, e só com sessão ativa. A chave-mestra continua só no
-- ambiente da API, então nem o banco nem a função bastam para ler o segredo.
BEGIN;

CREATE FUNCTION plugga_security.credenciais_google_oauth() RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE s.chave = 'google.oauth' AND plugga_security.usuario_id() IS NOT NULL
$fn$;

REVOKE ALL ON FUNCTION plugga_security.credenciais_google_oauth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.credenciais_google_oauth() TO plugga_runtime;

COMMIT;
