-- Fila do OMIE (PLU-342): ao desligar a conexão de uma empresa, os envios dela ficam
-- PAUSADOS, não descartados, e voltam ao religar (direção do Coordenador, 24/11/2026).
-- Nada se perde: o conector só reflete o que o Plugga OS, dono do financeiro, já fez.
--
-- Desligar = apagar o par da empresa (trocar o par segue como antes: a credencial
-- recusada pausa a empresa até o par novo ser confirmado). A empresa toda
-- para (pausa `*`, motivo `conexao_desligada`, sem prazo); os envios pendentes e com
-- erro dela ficam pendentes com esse motivo (o "Tentar de novo" não é preciso) e cada
-- lançamento ganha uma linha na linha do tempo. Religar = a conexão confirmada de novo
-- (a confirmação, ou o teste que conecta sozinho, já chamam `omie_retomar_empresa`): a
-- pausa sai, os envios voltam à fila e a linha do tempo registra a retomada. Sem a
-- conexão confirmada, a retomada não mexe nos pausados pela desconexão.
BEGIN;

-- FORCE RLS vale para o dono, que é quem roda as funções: só a linha do conector.
DO $dono$
BEGIN
  EXECUTE format($p$CREATE POLICY rls_conector_owner_insert ON public.historico_de_lancamento FOR INSERT TO %I
    WITH CHECK (tipo = 'omie')$p$, current_user);
END $dono$;

CREATE FUNCTION plugga_security.omie_pausar_por_desconexao(p_empresa text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_total integer := 0; v_lancamento uuid;
BEGIN
  IF NOT plugga_security.tem_tela(ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'], true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAUSAR_OMIE_REQUER_GESTAO';
  END IF;
  PERFORM plugga_security.omie_pausar(p_empresa, '*', NULL, 'conexao_desligada');
  -- Trava cada lançamento antes dos envios, na mesma ordem do worker e da aplicação.
  FOR v_lancamento IN SELECT DISTINCT e.lancamento_id FROM public.omie_envios e
      WHERE e.company_id = p_empresa AND e.estado IN ('pendente', 'erro')
      ORDER BY e.lancamento_id LOOP
    PERFORM 1 FROM public.lancamentos l WHERE l.id = v_lancamento FOR UPDATE;
    UPDATE public.omie_envios e SET
      estado = 'pendente',
      tentativas = CASE WHEN e.estado = 'erro' THEN 0 ELSE e.tentativas END,
      ultimo_erro = 'conexao_desligada'
    WHERE e.lancamento_id = v_lancamento AND e.estado IN ('pendente', 'erro');
    INSERT INTO public.historico_de_lancamento (lancamento_id, tipo, por_id, dados)
    VALUES (v_lancamento, 'omie', plugga_security.usuario_id(), jsonb_build_object('acao', 'pausado', 'motivo', 'conexao_desligada'));
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_pausar_por_desconexao(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.omie_pausar_por_desconexao(text) TO plugga_runtime;

-- A retomada de 20261124500100, mais os pausados pela desconexão (só com a conexão confirmada).
CREATE OR REPLACE FUNCTION plugga_security.omie_retomar_empresa(p_empresa text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_total integer := 0; v_envio record; v_lancamento uuid;
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

  IF plugga_security.omie_conectado(p_empresa) THEN
    DELETE FROM public.omie_pausas p WHERE p.company_id = p_empresa AND p.metodo = '*' AND p.motivo = 'conexao_desligada';
    FOR v_lancamento IN SELECT DISTINCT e.lancamento_id FROM public.omie_envios e
        WHERE e.company_id = p_empresa AND e.estado = 'pendente' AND e.ultimo_erro = 'conexao_desligada'
        ORDER BY e.lancamento_id LOOP
      PERFORM 1 FROM public.lancamentos l WHERE l.id = v_lancamento FOR UPDATE;
      UPDATE public.omie_envios e SET ultimo_erro = NULL, proxima_tentativa_em = now()
        WHERE e.lancamento_id = v_lancamento AND e.estado = 'pendente' AND e.ultimo_erro = 'conexao_desligada';
      INSERT INTO public.historico_de_lancamento (lancamento_id, tipo, por_id, dados)
      VALUES (v_lancamento, 'omie', plugga_security.usuario_id(), jsonb_build_object('acao', 'retomado'));
      v_total := v_total + 1;
    END LOOP;
  END IF;
  RETURN v_total;
END
$fn$;

COMMIT;
