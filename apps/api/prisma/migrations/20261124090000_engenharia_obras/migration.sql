-- Obras com marcos, documentos e cronograma (PLU-350). A tabela `obras`, que o
-- Compras já usa como destino do pedido e o Estoque como destino da saída,
-- passa a ser também o centro de custo do Financeiro (CC1): um cadastro só.
--
--   * obra: tipo do centro, potência, responsável, início, entrega prevista e
--     orçamento (só o gerente da Engenharia, CC-D6); nada se apaga;
--   * marcos (E8): os 6 padrão por obra; o feito não muda;
--   * documentos e cronograma do MS Project (D30): versões pela série, só
--     substitui; o projeto elétrico pode apontar o protocolo (E11);
--   * O.S. ligada à obra.
-- A etapa do POP (`etapa_atual`) fica como está, fora do fluxo.
-- Políticas novas com as funções de segurança em (SELECT ...) (InitPlan).

BEGIN;

CREATE TYPE "public"."tipo_de_obra" AS ENUM ('obra_solar', 'projeto', 'manutencao', 'gestao_de_energia', 'interno');

CREATE TYPE "public"."categoria_de_documento_de_obra" AS ENUM ('cronograma', 'evte', 'rvt', 'grd', 'ata', 'projeto_eletrico', 'outro');

ALTER TABLE "public"."obras" ADD COLUMN     "entrega_prevista_em" TIMESTAMPTZ(6),
ADD COLUMN     "inicio_em" TIMESTAMPTZ(6),
ADD COLUMN     "orcamento" DECIMAL(14,2),
ADD COLUMN     "potencia_kwp" DECIMAL(12,3),
ADD COLUMN     "responsavel_id" UUID,
ADD COLUMN     "tipo" "public"."tipo_de_obra" NOT NULL DEFAULT 'obra_solar';

ALTER TABLE "public"."ordens_de_servico" ADD COLUMN     "obra_id" UUID;

CREATE TABLE "public"."marcos_de_obra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "obra_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "previsto_em" TIMESTAMPTZ(6) NOT NULL,
    "feito_em" TIMESTAMPTZ(6),
    "feito_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcos_de_obra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."documentos_de_obra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "obra_id" UUID NOT NULL,
    "serie_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "categoria" "public"."categoria_de_documento_de_obra" NOT NULL,
    "protocolo_id" UUID,
    "arquivo_chave" TEXT NOT NULL,
    "arquivo_nome" TEXT NOT NULL,
    "arquivo_tamanho" INTEGER NOT NULL,
    "arquivo_tipo" TEXT NOT NULL,
    "enviado_por_id" UUID,
    "enviado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "substituido_em" TIMESTAMPTZ(6),
    "substituido_por_id" UUID,

    CONSTRAINT "documentos_de_obra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marcos_de_obra_obra_id_ordem_key" ON "public"."marcos_de_obra"("obra_id", "ordem");

CREATE UNIQUE INDEX "documentos_de_obra_arquivo_chave_key" ON "public"."documentos_de_obra"("arquivo_chave");

CREATE INDEX "documentos_de_obra_obra_id_enviado_em_idx" ON "public"."documentos_de_obra"("obra_id", "enviado_em");

CREATE UNIQUE INDEX "documentos_de_obra_serie_id_versao_key" ON "public"."documentos_de_obra"("serie_id", "versao");

ALTER TABLE "public"."obras" ADD CONSTRAINT "obras_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."marcos_de_obra" ADD CONSTRAINT "marcos_de_obra_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."marcos_de_obra" ADD CONSTRAINT "marcos_de_obra_feito_por_id_fkey" FOREIGN KEY ("feito_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."documentos_de_obra" ADD CONSTRAINT "documentos_de_obra_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."documentos_de_obra" ADD CONSTRAINT "documentos_de_obra_protocolo_id_fkey" FOREIGN KEY ("protocolo_id") REFERENCES "public"."protocolos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."documentos_de_obra" ADD CONSTRAINT "documentos_de_obra_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."documentos_de_obra" ADD CONSTRAINT "documentos_de_obra_substituido_por_id_fkey" FOREIGN KEY ("substituido_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.obras
  ADD CONSTRAINT obras_interno_sem_cliente CHECK (tipo <> 'interno' OR client_id IS NULL),
  ADD CONSTRAINT obras_potencia_positiva CHECK (potencia_kwp IS NULL OR potencia_kwp > 0),
  ADD CONSTRAINT obras_orcamento_positivo CHECK (orcamento IS NULL OR orcamento > 0),
  ADD CONSTRAINT obras_periodo CHECK ((inicio_em IS NULL) = (entrega_prevista_em IS NULL) AND (entrega_prevista_em IS NULL OR entrega_prevista_em > inicio_em));
ALTER TABLE public.marcos_de_obra
  ADD CONSTRAINT marcos_de_obra_ordem CHECK (ordem BETWEEN 1 AND 20),
  ADD CONSTRAINT marcos_de_obra_nome CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  ADD CONSTRAINT marcos_de_obra_feito_coerente CHECK (feito_por_id IS NULL OR feito_em IS NOT NULL);
ALTER TABLE public.documentos_de_obra
  ADD CONSTRAINT documentos_de_obra_tamanho_positivo CHECK (arquivo_tamanho > 0),
  ADD CONSTRAINT documentos_de_obra_versao CHECK (versao >= 1),
  ADD CONSTRAINT documentos_de_obra_protocolo_do_projeto CHECK (protocolo_id IS NULL OR categoria = 'projeto_eletrico'),
  ADD CONSTRAINT documentos_de_obra_substituicao_coerente CHECK (substituido_por_id IS NULL OR substituido_em IS NOT NULL);
-- Uma versão atual por série; um cronograma atual por obra.
CREATE UNIQUE INDEX documentos_de_obra_uma_atual_por_serie ON public.documentos_de_obra (serie_id) WHERE substituido_em IS NULL;
CREATE UNIQUE INDEX documentos_de_obra_um_cronograma_atual ON public.documentos_de_obra (obra_id) WHERE categoria = 'cronograma' AND substituido_em IS NULL;
CREATE INDEX ordens_de_servico_obra_id_idx ON public.ordens_de_servico (obra_id);

-- ---------------------------------------------------------------- RLS

DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['marcos_de_obra', 'documentos_de_obra'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
  END LOOP;
END $regime$;
GRANT SELECT, INSERT, UPDATE ON public.marcos_de_obra TO plugga_runtime;
GRANT SELECT, INSERT, UPDATE ON public.documentos_de_obra TO plugga_runtime;
-- A obra não se apaga (a política nunca existiu; o grant herdado sai).
REVOKE DELETE ON public.obras FROM plugga_runtime;

-- A Engenharia cadastra e muda a obra; o Compras segue com a criação rápida até a PLU-355.
CREATE POLICY rls_inserir_da_engenharia ON public.obras FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])) AND criado_por_id = (SELECT plugga_security.usuario_id()));
CREATE POLICY rls_atualizar ON public.obras FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras']))) WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])));

-- Marcos e documentos: lê quem lê a obra; grava quem tem a tela de Obras.
CREATE POLICY rls_ler ON public.marcos_de_obra FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_id));
CREATE POLICY rls_inserir ON public.marcos_de_obra FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])) AND feito_em IS NULL);
CREATE POLICY rls_atualizar ON public.marcos_de_obra FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras']))) WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])) AND (feito_por_id IS NULL OR feito_por_id = (SELECT plugga_security.usuario_id())));
CREATE POLICY rls_ler ON public.documentos_de_obra FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_id));
CREATE POLICY rls_inserir ON public.documentos_de_obra FOR INSERT TO plugga_runtime
  WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])) AND enviado_por_id = (SELECT plugga_security.usuario_id()) AND substituido_em IS NULL);
CREATE POLICY rls_atualizar ON public.documentos_de_obra FOR UPDATE TO plugga_runtime
  USING ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras']))) WITH CHECK ((SELECT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'])) AND substituido_por_id = (SELECT plugga_security.usuario_id()));

-- ---------------------------------------------------------------- regras de banco

-- Orçamento só do gerente da Engenharia (a plataforma passa). Vale para o
-- login da aplicação; migrations e o dono do banco não passam por aqui.
-- Empresa, autor e criação não mudam; cliente e início só saem do vazio.
CREATE FUNCTION plugga_security.obra_coerente() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF pg_has_role(current_user, 'plugga_runtime', 'MEMBER') AND NOT plugga_security.tem_tela(ARRAY['engenharia-obras.obras'], true)
    AND ((TG_OP = 'INSERT' AND NEW.orcamento IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.orcamento IS DISTINCT FROM OLD.orcamento)) THEN
    RAISE EXCEPTION 'o orçamento da obra é do gerente da Engenharia';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.company_id, NEW.created_at) IS DISTINCT FROM (OLD.company_id, OLD.created_at)
      OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL)
      OR (OLD.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id)
      OR (OLD.inicio_em IS NOT NULL AND NEW.inicio_em IS DISTINCT FROM OLD.inicio_em) THEN
      RAISE EXCEPTION 'empresa, autor, cliente e início da obra não mudam';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.obra_coerente() FROM PUBLIC;
CREATE TRIGGER obras_coerente BEFORE INSERT OR UPDATE ON public.obras FOR EACH ROW EXECUTE FUNCTION plugga_security.obra_coerente();

-- O marco feito não muda; o pendente muda só a data prevista ou vira feito.
CREATE FUNCTION plugga_security.marco_de_obra_coerente() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF OLD.feito_em IS NOT NULL
    OR (NEW.obra_id, NEW.ordem, NEW.nome, NEW.created_at) IS DISTINCT FROM (OLD.obra_id, OLD.ordem, OLD.nome, OLD.created_at)
    OR (NEW.feito_em IS NOT NULL AND NEW.previsto_em IS DISTINCT FROM OLD.previsto_em) THEN
    RAISE EXCEPTION 'marco feito não muda; o pendente só é reprogramado ou feito';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.marco_de_obra_coerente() FROM PUBLIC;
CREATE TRIGGER marcos_de_obra_coerente BEFORE UPDATE ON public.marcos_de_obra FOR EACH ROW EXECUTE FUNCTION plugga_security.marco_de_obra_coerente();

-- O documento só é marcado como substituído, uma vez.
CREATE FUNCTION plugga_security.documento_de_obra_so_substitui() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF OLD.substituido_em IS NOT NULL
    OR NEW.substituido_em IS NULL
    OR (NEW.obra_id, NEW.serie_id, NEW.versao, NEW.categoria, NEW.protocolo_id, NEW.arquivo_chave, NEW.arquivo_nome, NEW.arquivo_tamanho, NEW.arquivo_tipo, NEW.enviado_por_id, NEW.enviado_em)
       IS DISTINCT FROM (OLD.obra_id, OLD.serie_id, OLD.versao, OLD.categoria, OLD.protocolo_id, OLD.arquivo_chave, OLD.arquivo_nome, OLD.arquivo_tamanho, OLD.arquivo_tipo, OLD.enviado_por_id, OLD.enviado_em)
  THEN
    RAISE EXCEPTION 'documento da obra só pode ser marcado como substituído, uma vez';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.documento_de_obra_so_substitui() FROM PUBLIC;
CREATE TRIGGER documentos_de_obra_so_substitui BEFORE UPDATE ON public.documentos_de_obra FOR EACH ROW EXECUTE FUNCTION plugga_security.documento_de_obra_so_substitui();

-- Nomes da obra: clientes e pessoas (responsável, quem fez o marco, quem enviou),
-- para quem tem a tela de Obras. Só id e nome; sem ramo novo no diretorio().
CREATE FUNCTION plugga_security.nomes_das_obras(clientes uuid[], pessoas uuid[])
RETURNS TABLE(tipo text, id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT 'cliente', c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.obras']) AND c.id = ANY($1)
  UNION ALL
  SELECT 'pessoa', u.id, u.name FROM public.users u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.obras']) AND u.id = ANY($2)
    AND (EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras')
      OR EXISTS (SELECT 1 FROM public.obras o WHERE o.criado_por_id = u.id OR o.responsavel_id = u.id))
$fn$;
REVOKE ALL ON FUNCTION plugga_security.nomes_das_obras(uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.nomes_das_obras(uuid[], uuid[]) TO plugga_runtime;

-- Responsáveis possíveis: pessoas ativas da Engenharia (com alguma tela), só id e nome.
CREATE FUNCTION plugga_security.responsaveis_de_obra()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.name FROM public.users u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.obras']) AND u.status = 'active'
    AND EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras' AND cardinality(d.telas) > 0)
    AND NOT EXISTS (SELECT 1 FROM public.agent_identities a WHERE a.user_id = u.id)
  ORDER BY u.name
  LIMIT 500
$fn$;
REVOKE ALL ON FUNCTION plugga_security.responsaveis_de_obra() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.responsaveis_de_obra() TO plugga_runtime;

COMMIT;
