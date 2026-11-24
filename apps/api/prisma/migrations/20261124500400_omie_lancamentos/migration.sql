-- O estado do lançamento no OMIE sai do núcleo e vai para o conector (PLU-342, S2 da
-- separação: o Plugga OS é o dono do financeiro e o OMIE é um conector desligável).
--
-- Fase de expansão. A tabela do conector `omie_lancamentos` nasce com o backfill das
-- colunas de `lancamentos`. O gatilho dos envios passa a gravar nos dois lugares, e a
-- API lê pelo LEFT JOIN: sem linha, o lançamento está `nao_enviado`. As colunas
-- `lancamentos.omie_estado`, `omie_codigo` e `omie_motivo` saem numa migration própria,
-- depois que esta estiver em uso e a paridade provada.
--
-- A aplicação só lê a tabela; quem grava é o gatilho (o dono da função). O pool dos
-- jobs não recebe nada.
BEGIN;

CREATE TABLE public.omie_lancamentos (
  lancamento_id uuid PRIMARY KEY REFERENCES public.lancamentos(id) ON DELETE RESTRICT,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  estado public.financeiro_estado_omie NOT NULL DEFAULT 'nao_enviado',
  -- O código do título no OMIE, depois de enviado.
  codigo text,
  -- Só o motivo curto, nunca a resposta do OMIE.
  motivo text,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT omie_lancamentos_codigo_curto CHECK (codigo IS NULL OR length(codigo) BETWEEN 1 AND 60)
);
CREATE INDEX omie_lancamentos_company_id_idx ON public.omie_lancamentos (company_id);
-- O filtro "com erro no OMIE" da lista.
CREATE INDEX omie_lancamentos_com_problema_idx ON public.omie_lancamentos (lancamento_id) WHERE estado IN ('erro', 'divergente');

-- backfill:inicio
-- O estado de hoje de cada lançamento que já passou pelo conector. Sem linha vale
-- `nao_enviado`, então o lançamento que nunca foi ao OMIE não precisa de linha.
-- Idempotente: o que já tem linha fica como está.
INSERT INTO public.omie_lancamentos (lancamento_id, company_id, estado, codigo, motivo)
SELECT l.id, l.company_id, l.omie_estado, l.omie_codigo, l.omie_motivo
FROM public.lancamentos l
WHERE l.omie_estado <> 'nao_enviado' OR l.omie_codigo IS NOT NULL OR l.omie_motivo IS NOT NULL
   OR EXISTS (SELECT 1 FROM public.omie_envios e WHERE e.lancamento_id = l.id)
ON CONFLICT (lancamento_id) DO NOTHING;
-- backfill:fim

-- O gatilho dos envios grava o estado derivado na tabela do conector e, até a
-- migration da contração, também nas colunas antigas. Mesma derivação de antes.
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

-- ------------------------------------------------------------ RLS
ALTER TABLE public.omie_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omie_lancamentos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.omie_lancamentos FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
DO $dono$
BEGIN
  -- FORCE RLS também vale para o dono, que é quem roda o gatilho SECURITY DEFINER.
  EXECUTE format('CREATE POLICY rls_helper_owner ON public.omie_lancamentos FOR SELECT TO %I USING (true)', current_user);
  EXECUTE format('CREATE POLICY rls_gatilho_owner_insert ON public.omie_lancamentos FOR INSERT TO %I WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY rls_gatilho_owner_update ON public.omie_lancamentos FOR UPDATE TO %I USING (true) WITH CHECK (true)', current_user);
END $dono$;

-- A aplicação só lê, e só o que ela vê do lançamento (o RLS de `lancamentos` no EXISTS).
GRANT SELECT ON public.omie_lancamentos TO plugga_runtime;
CREATE POLICY rls_ler ON public.omie_lancamentos FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id));

COMMIT;
