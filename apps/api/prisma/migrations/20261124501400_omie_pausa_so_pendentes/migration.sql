-- Fila do OMIE (PLU-342), revisão do ff5325b:
--
-- 1. A pausa pela conexão desligada mexe só nos envios PENDENTES (ganham o motivo
--    `conexao_desligada`). Os que estão em `erro` ficam como estão, com o motivo deles:
--    um erro permanente (`recusada`) reenviado sozinho na retomada falharia de novo e
--    gastaria a cota de erros que leva o OMIE a bloquear o IP. Eles voltam pelo
--    "Tentar de novo", depois de religar. A retomada já revive só os pendentes pausados.
-- 2. Na derivação do estado no OMIE, o pendente pausado conta como `nao_enviado`, com
--    o motivo `conexao_desligada`, e não como `enviando` (o título que já estava no OMIE
--    não está saindo enquanto a conexão está desligada). O resto da derivação é o da
--    20261124500400 (que grava na tabela do conector e, até a contração, nas colunas).
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.omie_pausar_por_desconexao(p_empresa text) RETURNS integer
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
      WHERE e.company_id = p_empresa AND e.estado = 'pendente'
      ORDER BY e.lancamento_id LOOP
    PERFORM 1 FROM public.lancamentos l WHERE l.id = v_lancamento FOR UPDATE;
    UPDATE public.omie_envios e SET ultimo_erro = 'conexao_desligada'
     WHERE e.lancamento_id = v_lancamento AND e.estado = 'pendente';
    INSERT INTO public.historico_de_lancamento (lancamento_id, tipo, por_id, dados)
    VALUES (v_lancamento, 'omie', plugga_security.usuario_id(), jsonb_build_object('acao', 'pausado', 'motivo', 'conexao_desligada'));
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.omie_estado_do_lancamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_codigo text;
  v_erro text;
  v_motivo text;
  v_estado public.financeiro_estado_omie;
BEGIN
  SELECT e.codigo_omie INTO v_codigo FROM public.omie_envios e
    WHERE e.lancamento_id = NEW.lancamento_id AND e.operacao = 'upsert' AND e.estado = 'enviado'
    ORDER BY e.ordem DESC LIMIT 1;
  SELECT e.ultimo_erro INTO v_erro FROM public.omie_envios e
    WHERE e.lancamento_id = NEW.lancamento_id AND e.estado = 'erro'
    ORDER BY e.ordem DESC LIMIT 1;
  IF v_erro IS NOT NULL THEN
    v_estado := 'erro'; v_motivo := v_erro;
  -- Pausado pela conexão desligada: não está saindo, espera a conexão voltar.
  ELSIF EXISTS (SELECT 1 FROM public.omie_envios e WHERE e.lancamento_id = NEW.lancamento_id
      AND e.estado = 'pendente' AND e.ultimo_erro = 'conexao_desligada') THEN
    v_estado := 'nao_enviado'; v_motivo := 'conexao_desligada';
  ELSIF EXISTS (SELECT 1 FROM public.omie_envios e WHERE e.lancamento_id = NEW.lancamento_id
      AND (e.estado = 'enviando' OR (e.estado = 'pendente' AND v_codigo IS NOT NULL))) THEN
    v_estado := 'enviando';
  ELSIF v_codigo IS NULL THEN
    SELECT e.ultimo_erro INTO v_motivo FROM public.omie_envios e
      WHERE e.lancamento_id = NEW.lancamento_id AND e.estado = 'pendente'
      ORDER BY e.ordem DESC LIMIT 1;
    v_estado := 'nao_enviado';
  ELSIF EXISTS (SELECT 1 FROM public.omie_envios e WHERE e.lancamento_id = NEW.lancamento_id
      AND e.operacao = 'baixa' AND e.estado = 'enviado') THEN
    v_estado := 'baixado';
  ELSE
    v_estado := 'enviado';
  END IF;
  INSERT INTO public.omie_lancamentos AS o (lancamento_id, company_id, estado, codigo, motivo)
    VALUES (NEW.lancamento_id, NEW.company_id, v_estado, v_codigo, v_motivo)
    ON CONFLICT (lancamento_id) DO UPDATE
      SET estado = EXCLUDED.estado, codigo = EXCLUDED.codigo, motivo = EXCLUDED.motivo, updated_at = now()
      WHERE (o.estado, o.codigo, o.motivo) IS DISTINCT FROM (EXCLUDED.estado, EXCLUDED.codigo, EXCLUDED.motivo);
  -- Até a contração: as colunas antigas seguem iguais à tabela do conector.
  UPDATE public.lancamentos l SET omie_estado = v_estado, omie_codigo = v_codigo, omie_motivo = v_motivo
    WHERE l.id = NEW.lancamento_id
      AND (l.omie_estado, l.omie_codigo, l.omie_motivo) IS DISTINCT FROM (v_estado, v_codigo, v_motivo);
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_estado_do_lancamento() FROM PUBLIC;

COMMIT;
