-- A categoria deixa de ser obrigatória na conta a pagar (CC14, decidido pelo André):
-- a despesa nasce sem categoria (a da compra aprovada, por exemplo) e o Financeiro
-- classifica depois. A cobrança (entrada) continua com a categoria obrigatória.
--
-- Sem categoria, a despesa não vai ao OMIE: o pedido fica no outbox, o despacho não o
-- leva e o worker não o tira de `pendente`. Ao classificar, ele sai sozinho, na ordem
-- dos envios do lançamento. As duas funções são as de 20261124500000, com essa
-- condição a mais.
BEGIN;

ALTER TABLE public.lancamentos ALTER COLUMN categoria_id DROP NOT NULL;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_entrada_com_categoria
  CHECK (tipo = 'saida' OR categoria_id IS NOT NULL);

CREATE OR REPLACE FUNCTION plugga_security.omie_envios_devidos(p_limite integer)
RETURNS TABLE(id uuid, lancamento_id uuid, company_id text, tipo public.financeiro_tipo_lancamento, operacao public.omie_operacao, tentativas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT e.id, e.lancamento_id, e.company_id, l.tipo, e.operacao, e.tentativas
  FROM public.omie_envios e JOIN public.lancamentos l ON l.id = e.lancamento_id
  WHERE e.estado = 'pendente' AND e.proxima_tentativa_em <= now()
    -- Sem categoria, espera a classificação (CC14).
    AND l.categoria_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.omie_envios a
      WHERE a.lancamento_id = e.lancamento_id AND a.ordem < e.ordem AND a.estado NOT IN ('enviado', 'descartado'))
  ORDER BY e.proxima_tentativa_em, e.ordem
  LIMIT least(greatest($1, 1), 500)
$fn$;

CREATE OR REPLACE FUNCTION plugga_security.omie_envio_transicao(
  p_envio uuid,
  p_de public.omie_estado_do_envio,
  p_para public.omie_estado_do_envio,
  p_tentativas integer,
  p_proxima timestamptz,
  p_erro text,
  p_codigo text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_lancamento uuid; v_ordem bigint; v_categoria uuid;
BEGIN
  IF NOT ((p_de = 'pendente' AND p_para = 'enviando')
       OR (p_de = 'enviando' AND p_para IN ('enviado', 'erro', 'pendente'))) THEN
    RAISE EXCEPTION 'transição do worker inválida: % -> %', p_de, p_para USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.lancamento_id, e.ordem INTO v_lancamento, v_ordem FROM public.omie_envios e WHERE e.id = p_envio;
  IF v_lancamento IS NULL THEN RETURN false; END IF;
  SELECT l.categoria_id INTO v_categoria FROM public.lancamentos l WHERE l.id = v_lancamento FOR UPDATE;
  -- Sem categoria, não sai (CC14): o despacho já não o leva, e o worker confere de novo.
  IF p_para = 'enviando' AND v_categoria IS NULL THEN
    RETURN false;
  END IF;
  IF p_para = 'enviando' AND EXISTS (
    SELECT 1 FROM public.omie_envios a
    WHERE a.lancamento_id = v_lancamento AND a.ordem < v_ordem AND a.estado NOT IN ('enviado', 'descartado')
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.omie_envios e SET
    estado = p_para,
    tentativas = coalesce(p_tentativas, e.tentativas),
    proxima_tentativa_em = coalesce(p_proxima, e.proxima_tentativa_em),
    ultimo_erro = CASE WHEN p_para = 'enviando' THEN e.ultimo_erro ELSE p_erro END,
    codigo_omie = coalesce(p_codigo, e.codigo_omie),
    enviado_em = CASE WHEN p_para = 'enviado' THEN now() END
  WHERE e.id = p_envio AND e.estado = p_de
    AND (p_para <> 'enviando' OR e.proxima_tentativa_em <= now());
  RETURN FOUND;
END
$fn$;

COMMIT;
