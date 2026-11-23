-- Fila do OMIE (PLU-342), revisão do fa55993:
--
-- 1. Credenciais recusadas pausam a empresa até o par ser testado ou confirmado de
--    novo, não por 30 minutos: depois de 30 minutos, o despacho mandaria até 100
--    envios com a mesma credencial errada, que é a sequência de erros que leva o
--    OMIE a bloquear o IP. `omie_pausar` aceita `p_ate` NULL como "até retomar"
--    (infinity), e `omie_retomar_empresa` tira essa pausa e devolve à fila os
--    envios que falharam por ela; o teste e a confirmação do par chamam a retomada.
-- 2. A aplicação só muda, num envio, o estado, as tentativas, o motivo e a próxima
--    tentativa: `codigo_omie` e `enviado_em` são do worker (o dono das funções).
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.omie_pausar(p_empresa text, p_metodo text, p_ate timestamptz, p_motivo text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  INSERT INTO public.omie_pausas AS p (company_id, metodo, ate, motivo) VALUES ($1, $2, coalesce($3, 'infinity'::timestamptz), $4)
  ON CONFLICT (company_id, metodo) DO UPDATE SET ate = greatest(p.ate, EXCLUDED.ate), motivo = EXCLUDED.motivo, updated_at = now()
$fn$;

-- O par da empresa voltou a funcionar (teste ou confirmação): sai a pausa da empresa
-- toda por credencial e os envios que falharam por ela voltam à fila. Só quem gerencia
-- a conexão do OMIE (plataforma ou gerente do Financeiro). Trava cada lançamento antes
-- do envio, na mesma ordem do worker e da aplicação.
CREATE FUNCTION plugga_security.omie_retomar_empresa(p_empresa text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_total integer := 0; v_envio record;
BEGIN
  IF NOT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RETOMAR_OMIE_REQUER_GESTAO';
  END IF;
  DELETE FROM public.omie_pausas p WHERE p.company_id = p_empresa AND p.metodo = '*' AND p.motivo = 'credenciais_invalidas';
  FOR v_envio IN SELECT e.id, e.lancamento_id FROM public.omie_envios e
      WHERE e.company_id = p_empresa AND e.estado = 'erro' AND e.ultimo_erro = 'credenciais_invalidas'
      ORDER BY e.lancamento_id LOOP
    PERFORM 1 FROM public.lancamentos l WHERE l.id = v_envio.lancamento_id FOR UPDATE;
    UPDATE public.omie_envios e SET estado = 'pendente', tentativas = 0, ultimo_erro = NULL, proxima_tentativa_em = now()
      WHERE e.id = v_envio.id AND e.estado = 'erro';
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_retomar_empresa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.omie_retomar_empresa(text) TO plugga_runtime;

DO $dono$ BEGIN
  EXECUTE format('CREATE POLICY rls_fila_owner_delete ON public.omie_pausas FOR DELETE TO %I USING (true)', current_user);
END $dono$;

CREATE OR REPLACE FUNCTION plugga_security.omie_envio_coerente() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'pendente' OR NEW.tentativas <> 0 OR NEW.codigo_omie IS NOT NULL OR NEW.enviado_em IS NOT NULL THEN
      RAISE EXCEPTION 'o envio ao OMIE nasce pendente' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = NEW.lancamento_id AND l.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'a empresa do envio é a do lançamento' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'envio ao OMIE não se apaga' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.ordem, NEW.lancamento_id, NEW.company_id, NEW.operacao, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.ordem, OLD.lancamento_id, OLD.company_id, OLD.operacao, OLD.created_at)
     OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL) THEN
    RAISE EXCEPTION 'identidade do envio ao OMIE não muda' USING ERRCODE = 'check_violation';
  END IF;
  -- O código do OMIE e a data do envio só o worker grava (pelas funções do dono).
  IF (NEW.codigo_omie, NEW.enviado_em) IS DISTINCT FROM (OLD.codigo_omie, OLD.enviado_em)
    AND current_user <> pg_get_userbyid((SELECT p.proowner FROM pg_proc p WHERE p.oid = 'plugga_security.omie_envio_transicao(uuid, public.omie_estado_do_envio, public.omie_estado_do_envio, integer, timestamptz, text, text)'::regprocedure))
    AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND r.rolsuper) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ENVIO_AO_OMIE_SO_PELO_WORKER';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
       (OLD.estado = 'pendente' AND NEW.estado IN ('enviando', 'descartado'))
    OR (OLD.estado = 'enviando' AND NEW.estado IN ('enviado', 'erro', 'pendente'))
    OR (OLD.estado = 'erro' AND NEW.estado IN ('pendente', 'descartado'))) THEN
    RAISE EXCEPTION 'transição de envio ao OMIE inválida: % -> %', OLD.estado, NEW.estado USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado IN ('enviado', 'descartado') AND NEW.criado_por_id IS NOT DISTINCT FROM OLD.criado_por_id THEN
    RAISE EXCEPTION 'envio ao OMIE encerrado não muda' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

COMMIT;
