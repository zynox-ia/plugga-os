-- Financeiro (PLU-337): anexos do lançamento com histórico de substituição, a
-- linha do tempo, os marcos da entrada (NF, boleto, envio) e as UCs da cobrança.
--
-- Anexo não se apaga (D9): substituir marca o anterior, que continua baixável. A
-- linha do tempo é só de inserção, como o event_log, mas guarda o texto que a
-- pessoa escreveu (o motivo da correção, a nota da cobrança), que o event_log não
-- leva por não ter PII. O acesso segue o do lançamento: quem não vê o lançamento
-- não vê os anexos nem a linha do tempo.

BEGIN;

CREATE TYPE public.financeiro_tipo_anexo AS ENUM ('comprovante', 'nf', 'boleto', 'documento');

CREATE TABLE public.anexos_de_lancamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL,
  tipo public.financeiro_tipo_anexo NOT NULL,
  arquivo_chave text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_tamanho integer NOT NULL,
  arquivo_tipo text NOT NULL,
  enviado_por_id uuid,
  enviado_em timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  substituido_em timestamptz(6),
  substituido_por_id uuid,
  CONSTRAINT anexos_de_lancamento_pkey PRIMARY KEY (id),
  CONSTRAINT anexos_de_lancamento_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT anexos_de_lancamento_enviado_por_id_fkey FOREIGN KEY (enviado_por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT anexos_de_lancamento_substituido_por_id_fkey FOREIGN KEY (substituido_por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT anexos_de_lancamento_tamanho_positivo CHECK (arquivo_tamanho > 0),
  CONSTRAINT anexos_de_lancamento_substituicao_coerente CHECK (substituido_por_id IS NULL OR substituido_em IS NOT NULL)
);
CREATE UNIQUE INDEX anexos_de_lancamento_arquivo_chave_key ON public.anexos_de_lancamento (arquivo_chave);
CREATE INDEX anexos_de_lancamento_lancamento_id_idx ON public.anexos_de_lancamento (lancamento_id, enviado_em);
-- Um comprovante, uma NF e um boleto atuais por lançamento; documentos, quantos forem.
CREATE UNIQUE INDEX anexos_de_lancamento_um_atual_por_tipo ON public.anexos_de_lancamento (lancamento_id, tipo)
  WHERE substituido_em IS NULL AND tipo IN ('comprovante', 'nf', 'boleto');

-- O anexo só pode ser marcado como substituído, uma vez; nada mais muda e nada se apaga.
CREATE FUNCTION plugga_security.anexo_so_substitui() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'anexo do lançamento não se apaga';
  END IF;
  IF OLD.substituido_em IS NOT NULL
    OR NEW.substituido_em IS NULL
    OR (NEW.lancamento_id, NEW.tipo, NEW.arquivo_chave, NEW.arquivo_nome, NEW.arquivo_tamanho, NEW.arquivo_tipo, NEW.enviado_por_id, NEW.enviado_em)
       IS DISTINCT FROM (OLD.lancamento_id, OLD.tipo, OLD.arquivo_chave, OLD.arquivo_nome, OLD.arquivo_tamanho, OLD.arquivo_tipo, OLD.enviado_por_id, OLD.enviado_em)
  THEN
    RAISE EXCEPTION 'anexo do lançamento só pode ser marcado como substituído, uma vez';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.anexo_so_substitui() FROM PUBLIC;
CREATE TRIGGER anexos_de_lancamento_so_substitui BEFORE UPDATE OR DELETE ON public.anexos_de_lancamento
  FOR EACH ROW EXECUTE FUNCTION plugga_security.anexo_so_substitui();

-- Linha do tempo: só de inserção. `dados` são os valores estruturados (de/para,
-- canal); `texto`, o que a pessoa escreveu.
CREATE TABLE public.historico_de_lancamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL,
  tipo text NOT NULL,
  em timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  por_id uuid,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  texto text,
  CONSTRAINT historico_de_lancamento_pkey PRIMARY KEY (id),
  CONSTRAINT historico_de_lancamento_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT historico_de_lancamento_por_id_fkey FOREIGN KEY (por_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT historico_de_lancamento_tipo_valido CHECK (tipo ~ '^[a-z_]{3,40}$')
);
CREATE INDEX historico_de_lancamento_lancamento_id_em_idx ON public.historico_de_lancamento (lancamento_id, em);
CREATE TRIGGER historico_de_lancamento_append_only BEFORE UPDATE OR DELETE ON public.historico_de_lancamento
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- Marcos da entrada.
ALTER TABLE public.lancamentos
  ADD COLUMN nf_numero text,
  ADD COLUMN nf_registrada_em timestamptz(6),
  ADD COLUMN nf_registrada_por_id uuid,
  ADD COLUMN boleto_registrado_em timestamptz(6),
  ADD COLUMN boleto_registrado_por_id uuid,
  ADD COLUMN enviado_em timestamptz(6),
  ADD COLUMN envio_canal text,
  ADD COLUMN enviado_por_id uuid,
  ADD CONSTRAINT lancamentos_nf_registrada_por_id_fkey FOREIGN KEY (nf_registrada_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT lancamentos_boleto_registrado_por_id_fkey FOREIGN KEY (boleto_registrado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT lancamentos_enviado_por_id_fkey FOREIGN KEY (enviado_por_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT lancamentos_nf_coerente CHECK ((nf_registrada_em IS NULL) = (nf_numero IS NULL)),
  ADD CONSTRAINT lancamentos_envio_coerente CHECK ((enviado_em IS NULL) = (envio_canal IS NULL)),
  ADD CONSTRAINT lancamentos_marcos_da_entrada CHECK (tipo = 'entrada' OR (nf_registrada_em IS NULL AND boleto_registrado_em IS NULL AND enviado_em IS NULL));

-- As UCs listadas dentro da cobrança (F3).
CREATE TABLE public.ucs_de_lancamento (
  lancamento_id uuid NOT NULL,
  consumer_unit_id uuid NOT NULL,
  CONSTRAINT ucs_de_lancamento_pkey PRIMARY KEY (lancamento_id, consumer_unit_id),
  CONSTRAINT ucs_de_lancamento_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ucs_de_lancamento_consumer_unit_id_fkey FOREIGN KEY (consumer_unit_id) REFERENCES public.consumer_units(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RLS: o acesso é o do lançamento (o subselect em lancamentos já passa pelo RLS dele).
DO $tabelas$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['anexos_de_lancamento', 'historico_de_lancamento', 'ucs_de_lancamento'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id))', tabela);
    EXECUTE format('CREATE POLICY rls_inserir ON public.%I FOR INSERT TO plugga_runtime WITH CHECK (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id))', tabela);
  END LOOP;
END $tabelas$;
GRANT SELECT, INSERT, UPDATE ON public.anexos_de_lancamento TO plugga_runtime;
GRANT SELECT, INSERT ON public.historico_de_lancamento, public.ucs_de_lancamento TO plugga_runtime;
CREATE POLICY rls_atualizar ON public.anexos_de_lancamento FOR UPDATE TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = lancamento_id));

-- As UCs para o Financeiro, que não lê o CRM: só id e código, das UCs dos clientes
-- pedidos (na criação da cobrança) ou das que uma cobrança lista.
CREATE FUNCTION plugga_security.ucs_para_financeiro(clientes uuid[]) RETURNS TABLE(id uuid, client_id uuid, code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code FROM public.consumer_units u
  WHERE plugga_security.tem_tela(ARRAY['financeiro.receber', 'financeiro.conciliacao'])
    AND u.client_id = ANY($1)
  ORDER BY u.code
$fn$;
REVOKE ALL ON FUNCTION plugga_security.ucs_para_financeiro(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.ucs_para_financeiro(uuid[]) TO plugga_runtime;

COMMIT;
