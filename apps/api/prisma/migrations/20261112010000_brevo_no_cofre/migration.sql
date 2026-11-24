-- Brevo configurado pela tela: a chave e o remetente moram cifrados em
-- `segredos_do_sistema` (chave lógica `email.brevo`). O envio de convite e de
-- redefinição roda no pool de autenticação, sem principal e sem acesso a
-- tabelas de negócio; ele recebe só o texto cifrado, por esta função. A
-- chave-mestra continua só no ambiente da API, então o banco sozinho não basta.
BEGIN;

CREATE FUNCTION plugga_security.config_brevo() RETURNS TABLE("valorCifrado" text, iv text, tag text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.valor_cifrado, s.iv, s.tag FROM public.segredos_do_sistema s
  WHERE s.chave = 'email.brevo'
$fn$;

REVOKE ALL ON FUNCTION plugga_security.config_brevo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.config_brevo() TO plugga_auth_runtime;

COMMIT;
