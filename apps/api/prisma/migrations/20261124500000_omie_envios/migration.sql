-- Fila do OMIE (PLU-342): o outbox `omie_envios` e as pausas por empresa e método.
--
-- O pedido de envio é gravado na mesma transação que muda o lançamento (aprovar,
-- pagar, gerar a cobrança, corrigir o valor, cancelar). O worker só chama o OMIE com
-- a integração em `write`; fora disso o envio fica `pendente` e o lançamento,
-- `nao_enviado`.
--
-- O estado do lançamento no OMIE (`lancamentos.omie_estado`, `omie_codigo` e
-- `omie_motivo`) deixa de ser gravado pela aplicação: um gatilho o deriva dos envios.
--
-- O pool dos jobs (`plugga_jobs_runtime`) não recebe privilégio de tabela nenhum
-- (a validação do pool recusa isso): ele lê e muda a fila só pelas funções
-- SECURITY DEFINER abaixo, que devolvem o mínimo e nunca os dados do lançamento.
BEGIN;

CREATE TYPE public.omie_operacao AS ENUM ('upsert', 'baixa', 'gerar_boleto', 'cancelar');
CREATE TYPE public.omie_estado_do_envio AS ENUM ('pendente', 'enviando', 'enviado', 'erro', 'descartado');

CREATE TABLE public.omie_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A ordem dos envios de um lançamento: a conta antes da baixa, a baixa antes do cancelamento.
  ordem bigint GENERATED ALWAYS AS IDENTITY,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE RESTRICT,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  operacao public.omie_operacao NOT NULL,
  estado public.omie_estado_do_envio NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz(6) NOT NULL DEFAULT now(),
  -- Só o motivo curto (OmieFalhouError), nunca a resposta do OMIE.
  ultimo_erro text,
  codigo_omie text,
  enviado_em timestamptz(6),
  criado_por_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT omie_envios_tentativas_validas CHECK (tentativas BETWEEN 0 AND 6),
  CONSTRAINT omie_envios_motivo_curto CHECK (ultimo_erro IS NULL OR ultimo_erro ~ '^[a-z_]{3,40}$'),
  CONSTRAINT omie_envios_erro_com_motivo CHECK (estado <> 'erro' OR ultimo_erro IS NOT NULL),
  CONSTRAINT omie_envios_enviado_coerente CHECK ((estado = 'enviado') = (enviado_em IS NOT NULL)),
  CONSTRAINT omie_envios_codigo_curto CHECK (codigo_omie IS NULL OR length(codigo_omie) BETWEEN 1 AND 60)
);

-- Um envio em aberto por lançamento e operação: aprovar duas vezes, ou corrigir o
-- valor com um envio na fila, junta no mesmo pedido.
CREATE UNIQUE INDEX omie_envios_um_aberto ON public.omie_envios (lancamento_id, operacao) WHERE estado IN ('pendente', 'erro');
CREATE INDEX omie_envios_lancamento_ordem_idx ON public.omie_envios (lancamento_id, ordem);
CREATE INDEX omie_envios_pendentes_idx ON public.omie_envios (proxima_tentativa_em) WHERE estado = 'pendente';
CREATE INDEX omie_envios_enviando_idx ON public.omie_envios (updated_at) WHERE estado = 'enviando';
CREATE INDEX omie_envios_company_id_idx ON public.omie_envios (company_id);
CREATE INDEX omie_envios_criado_por_id_idx ON public.omie_envios (criado_por_id);

-- Pausa de uma empresa num método do OMIE (bloqueio 425 / limite de consumo), ou na
-- empresa toda (`*`, credenciais recusadas). Só o worker grava, pela função.
CREATE TABLE public.omie_pausas (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  metodo text NOT NULL,
  ate timestamptz(6) NOT NULL,
  motivo text NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, metodo),
  CONSTRAINT omie_pausas_metodo_valido CHECK (metodo ~ '^([A-Z][A-Za-z]{2,40}|\*)$'),
  CONSTRAINT omie_pausas_motivo_curto CHECK (motivo ~ '^[a-z_]{3,40}$')
);

-- A empresa é a do lançamento, conferida na inserção; identidade e origem não mudam
-- (o autor só pode virar NULL, pelo ON DELETE SET NULL); o estado só segue as
-- transições da fila; nada se apaga.
CREATE FUNCTION plugga_security.omie_envio_coerente() RETURNS trigger
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
REVOKE ALL ON FUNCTION plugga_security.omie_envio_coerente() FROM PUBLIC;
CREATE TRIGGER omie_envios_coerente BEFORE INSERT OR UPDATE OR DELETE ON public.omie_envios
  FOR EACH ROW EXECUTE FUNCTION plugga_security.omie_envio_coerente();

-- O estado do lançamento no OMIE, derivado dos envios dele:
-- erro         algum envio em erro (motivo: o do mais recente);
-- enviando     algum envio saindo, ou pendente de um título que já está no OMIE;
-- nao_enviado  nada chegou ao OMIE (motivo: o do pendente, como `modo_sem_escrita`);
-- baixado      a baixa chegou; enviado, o título chegou.
-- `divergente` vem da leitura periódica, numa fatia própria.
CREATE FUNCTION plugga_security.omie_estado_do_lancamento() RETURNS trigger
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
  UPDATE public.lancamentos l SET omie_estado = v_estado, omie_codigo = v_codigo, omie_motivo = v_motivo
    WHERE l.id = NEW.lancamento_id
      AND (l.omie_estado, l.omie_codigo, l.omie_motivo) IS DISTINCT FROM (v_estado, v_codigo, v_motivo);
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.omie_estado_do_lancamento() FROM PUBLIC;
CREATE TRIGGER omie_envios_estado_do_lancamento AFTER INSERT OR UPDATE ON public.omie_envios
  FOR EACH ROW EXECUTE FUNCTION plugga_security.omie_estado_do_lancamento();

-- A aplicação não grava o estado no OMIE: só o gatilho acima (o dono da função).
CREATE FUNCTION plugga_security.lancamento_omie_pelo_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.omie_estado, NEW.omie_codigo, NEW.omie_motivo) IS DISTINCT FROM (OLD.omie_estado, OLD.omie_codigo, OLD.omie_motivo)
    AND current_user <> pg_get_userbyid((SELECT p.proowner FROM pg_proc p WHERE p.oid = 'plugga_security.omie_estado_do_lancamento()'::regprocedure))
    AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND r.rolsuper) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ESTADO_NO_OMIE_SO_PELO_OUTBOX';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.lancamento_omie_pelo_outbox() FROM PUBLIC;
CREATE TRIGGER lancamentos_omie_pelo_outbox BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION plugga_security.lancamento_omie_pelo_outbox();

-- ------------------------------------------------------------ o worker

-- Os envios que podem sair agora: pendentes vencidos e os primeiros em aberto do
-- lançamento (o anterior do mesmo lançamento tem de estar enviado ou descartado).
-- Devolve só o necessário para despachar; o tipo decide o método do OMIE.
CREATE FUNCTION plugga_security.omie_envios_devidos(p_limite integer)
RETURNS TABLE(id uuid, lancamento_id uuid, company_id text, tipo public.financeiro_tipo_lancamento, operacao public.omie_operacao, tentativas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT e.id, e.lancamento_id, e.company_id, l.tipo, e.operacao, e.tentativas
  FROM public.omie_envios e JOIN public.lancamentos l ON l.id = e.lancamento_id
  WHERE e.estado = 'pendente' AND e.proxima_tentativa_em <= now()
    AND NOT EXISTS (SELECT 1 FROM public.omie_envios a
      WHERE a.lancamento_id = e.lancamento_id AND a.ordem < e.ordem AND a.estado NOT IN ('enviado', 'descartado'))
  ORDER BY e.proxima_tentativa_em, e.ordem
  LIMIT least(greatest($1, 1), 500)
$fn$;

-- Um envio, para o worker conferir antes de chamar o OMIE.
CREATE FUNCTION plugga_security.omie_envio_para_enviar(p_envio uuid)
RETURNS TABLE(id uuid, lancamento_id uuid, company_id text, tipo public.financeiro_tipo_lancamento, operacao public.omie_operacao, estado public.omie_estado_do_envio, tentativas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT e.id, e.lancamento_id, e.company_id, l.tipo, e.operacao, e.estado, e.tentativas
  FROM public.omie_envios e JOIN public.lancamentos l ON l.id = e.lancamento_id
  WHERE e.id = $1
$fn$;

-- O worker muda o envio só por aqui: trava o lançamento antes do envio (a mesma
-- ordem da aplicação, sem deadlock), confere a ordem dos envios do lançamento e
-- aplica a transição só se o envio ainda está em `p_de` (dois workers: um ganha).
CREATE FUNCTION plugga_security.omie_envio_transicao(
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
DECLARE v_lancamento uuid; v_ordem bigint;
BEGIN
  IF NOT ((p_de = 'pendente' AND p_para = 'enviando')
       OR (p_de = 'enviando' AND p_para IN ('enviado', 'erro', 'pendente'))) THEN
    RAISE EXCEPTION 'transição do worker inválida: % -> %', p_de, p_para USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.lancamento_id, e.ordem INTO v_lancamento, v_ordem FROM public.omie_envios e WHERE e.id = p_envio;
  IF v_lancamento IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.lancamentos l WHERE l.id = v_lancamento FOR UPDATE;
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

-- Envio preso em `enviando` (o worker caiu no meio): volta à fila contando a
-- tentativa, ou vai a erro na sexta. Devolve quantos voltaram.
CREATE FUNCTION plugga_security.omie_envios_recuperar_presos(p_antes timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_total integer := 0; v_envio record;
BEGIN
  FOR v_envio IN SELECT e.id, e.lancamento_id, e.tentativas FROM public.omie_envios e
      WHERE e.estado = 'enviando' AND e.updated_at < p_antes ORDER BY e.lancamento_id LOOP
    PERFORM 1 FROM public.lancamentos l WHERE l.id = v_envio.lancamento_id FOR UPDATE;
    UPDATE public.omie_envios e SET
      estado = CASE WHEN v_envio.tentativas + 1 >= 6 THEN 'erro'::public.omie_estado_do_envio ELSE 'pendente'::public.omie_estado_do_envio END,
      tentativas = least(v_envio.tentativas + 1, 6),
      ultimo_erro = 'indisponivel',
      proxima_tentativa_em = now()
    WHERE e.id = v_envio.id AND e.estado = 'enviando';
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END
$fn$;

-- As pausas que ainda valem.
CREATE FUNCTION plugga_security.omie_pausas_ativas()
RETURNS TABLE(company_id text, metodo text, ate timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p.company_id, p.metodo, p.ate FROM public.omie_pausas p WHERE p.ate > now()
$fn$;

-- Pausa a empresa num método (ou na empresa toda, `*`) até `p_ate`; nunca encurta.
CREATE FUNCTION plugga_security.omie_pausar(p_empresa text, p_metodo text, p_ate timestamptz, p_motivo text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  INSERT INTO public.omie_pausas AS p (company_id, metodo, ate, motivo) VALUES ($1, $2, $3, $4)
  ON CONFLICT (company_id, metodo) DO UPDATE SET ate = greatest(p.ate, EXCLUDED.ate), motivo = EXCLUDED.motivo, updated_at = now()
$fn$;

DO $funcoes$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'plugga_security.omie_envios_devidos(integer)',
    'plugga_security.omie_envio_para_enviar(uuid)',
    'plugga_security.omie_envio_transicao(uuid, public.omie_estado_do_envio, public.omie_estado_do_envio, integer, timestamptz, text, text)',
    'plugga_security.omie_envios_recuperar_presos(timestamptz)',
    'plugga_security.omie_pausas_ativas()',
    'plugga_security.omie_pausar(text, text, timestamptz, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO plugga_jobs_runtime', f);
  END LOOP;
END $funcoes$;

-- ------------------------------------------------------------ RLS
-- A aplicação grava o pedido e o devolve à fila ("Tentar de novo"), ou o descarta no
-- cancelamento; não marca envio como enviado nem como erro. As pausas não têm acesso
-- da aplicação nem dos jobs: só as funções.
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['omie_envios', 'omie_pausas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    -- FORCE RLS também vale para o dono, que é quem roda as funções SECURITY DEFINER.
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('CREATE POLICY rls_fila_owner_update ON public.%I FOR UPDATE TO %I USING (true) WITH CHECK (true)', tabela, current_user);
  END LOOP;
  EXECUTE format('CREATE POLICY rls_fila_owner_insert ON public.omie_pausas FOR INSERT TO %I WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY rls_omie_owner_update ON public.lancamentos FOR UPDATE TO %I USING (true) WITH CHECK (true)', current_user);
END $tabelas$;

GRANT SELECT, INSERT, UPDATE ON public.omie_envios TO plugga_runtime;
CREATE POLICY rls_ler ON public.omie_envios FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id));
CREATE POLICY rls_inserir ON public.omie_envios FOR INSERT TO plugga_runtime
  WITH CHECK (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id));
CREATE POLICY rls_atualizar ON public.omie_envios FOR UPDATE TO plugga_runtime
  USING (estado IN ('pendente', 'erro') AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id))
  WITH CHECK (estado IN ('pendente', 'descartado') AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id));

COMMIT;
