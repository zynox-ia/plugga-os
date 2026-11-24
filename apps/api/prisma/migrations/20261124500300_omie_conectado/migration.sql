-- O conector do OMIE ligado para a empresa? (decisão de 24/11/2026: o Plugga OS é o dono do
-- financeiro e o OMIE é um conector desligável). O conector só grava pedidos no outbox se
-- a empresa tiver o par conferido e confirmado, a mesma condição da `config_omie`. Sem
-- conexão, nada vai ao outbox e o Financeiro funciona inteiro.
--
-- Devolve só sim ou não, sem expor nada do cofre, a quem opera o Financeiro: o membro
-- que aprova ou paga também passa por aqui, e não lê `omie_conexoes` (é da gerência).
BEGIN;

CREATE FUNCTION plugga_security.omie_conectado(p_empresa text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM plugga_security.config_omie($1))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_conectado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.omie_conectado(text) TO plugga_runtime;

COMMIT;
