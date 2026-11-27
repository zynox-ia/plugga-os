-- A comparação de unidades no banco com o mesmo critério do contrato (PLU-332,
-- revisão da leva 15).
--
-- 20261127200000 escrevia o conjunto de espaços das pontas como um literal de
-- escape com barra-v. O PostgreSQL não reconhece esse escape: ele vira a
-- letra "v". O banco tirava "v" das pontas ("mv" igual a "m") e não tirava a
-- tabulação vertical (U+000B), o inverso do contrato (unidadeDaLinhaConflita
-- em packages/shared/src/estoque.ts, que tira espaço, tab, LF, VT, FF e CR das
-- pontas). Agora o conjunto é montado com chr(): 32 (espaço), 9 (tab),
-- 10 (LF), 11 (VT), 12 (FF) e 13 (CR), sem escape nenhum.
-- Só o corpo da função muda; a assinatura e as permissões ficam.

BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.unidade_conflita(unidade_da_linha text, unidade_do_item text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT COALESCE(normalize(btrim($1, chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)), NFC), '') <> ''
    AND normalize(btrim($1, chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)), NFC)
      <> normalize(btrim($2, chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)), NFC)
$fn$;

COMMIT;
