-- Tarefas dos departamentos (PLU-349 na Engenharia, PLU-340 no Financeiro e,
-- depois, as obrigações da CCEE na Energia): um só modelo para todos.
--
--   * a tarefa é única ou recorrente; cada dia vira uma ocorrência, e a não
--     feita fica atrasada (decisão do André, 23/11/2026); feriado conta como dia
--     útil (E13/F13);
--   * nada se apaga: a tarefa é encerrada, a ocorrência concluída não muda e a
--     evidência só se insere;
--   * acesso por departamento: quem tem alguma tela do departamento da tarefa
--     (ou é da plataforma). Pessoas só por id e nome, por função própria.

BEGIN;

CREATE TYPE "public"."empresa_da_tarefa" AS ENUM ('plugga', 'waze', 'ambas');

CREATE TYPE "public"."tipo_de_tarefa" AS ENUM ('unica', 'recorrente');

CREATE TYPE "public"."origem_da_tarefa" AS ENUM ('criada', 'do_departamento');

CREATE TABLE "public"."tarefas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "departamento" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT,
    "empresa" "public"."empresa_da_tarefa" NOT NULL,
    "responsavel_id" UUID NOT NULL,
    "substituto_id" UUID,
    "tipo" "public"."tipo_de_tarefa" NOT NULL,
    "origem" "public"."origem_da_tarefa" NOT NULL DEFAULT 'criada',
    "regra" JSONB,
    "dia" TIMESTAMPTZ(6) NOT NULL,
    "horario_limite" TEXT NOT NULL,
    "exige_evidencia" BOOLEAN NOT NULL,
    "exige_resultado" BOOLEAN NOT NULL,
    "instrucoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "automacao" TEXT,
    "atalho" TEXT,
    "gerada_ate" TIMESTAMPTZ(6),
    "encerrada_em" TIMESTAMPTZ(6),
    "encerrada_por_id" UUID,
    "encerramento_motivo" TEXT,
    "criado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ocorrencias_de_tarefa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tarefa_id" UUID NOT NULL,
    "dia" TIMESTAMPTZ(6) NOT NULL,
    "prazo_em" TIMESTAMPTZ(6) NOT NULL,
    "concluida_em" TIMESTAMPTZ(6),
    "concluida_por_id" UUID,
    "resultado" TEXT,
    "checklist" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "cancelada_em" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocorrencias_de_tarefa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."evidencias_de_tarefa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ocorrencia_id" UUID NOT NULL,
    "arquivo_chave" TEXT NOT NULL,
    "arquivo_nome" TEXT NOT NULL,
    "arquivo_tamanho" INTEGER NOT NULL,
    "arquivo_tipo" TEXT NOT NULL,
    "enviado_por_id" UUID,
    "enviado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_de_tarefa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tarefas_departamento_encerrada_em_idx" ON "public"."tarefas"("departamento", "encerrada_em");

CREATE INDEX "ocorrencias_de_tarefa_dia_idx" ON "public"."ocorrencias_de_tarefa"("dia");

CREATE UNIQUE INDEX "ocorrencias_de_tarefa_tarefa_id_dia_key" ON "public"."ocorrencias_de_tarefa"("tarefa_id", "dia");

CREATE INDEX "evidencias_de_tarefa_ocorrencia_id_idx" ON "public"."evidencias_de_tarefa"("ocorrencia_id");

ALTER TABLE "public"."tarefas" ADD CONSTRAINT "tarefas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tarefas" ADD CONSTRAINT "tarefas_substituto_id_fkey" FOREIGN KEY ("substituto_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tarefas" ADD CONSTRAINT "tarefas_encerrada_por_id_fkey" FOREIGN KEY ("encerrada_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tarefas" ADD CONSTRAINT "tarefas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ocorrencias_de_tarefa" ADD CONSTRAINT "ocorrencias_de_tarefa_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ocorrencias_de_tarefa" ADD CONSTRAINT "ocorrencias_de_tarefa_concluida_por_id_fkey" FOREIGN KEY ("concluida_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."evidencias_de_tarefa" ADD CONSTRAINT "evidencias_de_tarefa_ocorrencia_id_fkey" FOREIGN KEY ("ocorrencia_id") REFERENCES "public"."ocorrencias_de_tarefa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."evidencias_de_tarefa" ADD CONSTRAINT "evidencias_de_tarefa_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.tarefas
  ADD CONSTRAINT tarefas_departamento_conhecido CHECK (departamento IN ('financeiro', 'engenharia-obras', 'energia-opm')),
  ADD CONSTRAINT tarefas_horario_limite CHECK (horario_limite ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT tarefas_exige_algo CHECK (exige_evidencia OR exige_resultado),
  ADD CONSTRAINT tarefas_regra_da_recorrente CHECK ((tipo = 'recorrente') = (regra IS NOT NULL)),
  ADD CONSTRAINT tarefas_substituto_distinto CHECK (substituto_id IS NULL OR substituto_id <> responsavel_id),
  ADD CONSTRAINT tarefas_encerramento_completo CHECK ((encerrada_em IS NULL) = (encerramento_motivo IS NULL)),
  ADD CONSTRAINT tarefas_instrucoes CHECK (instrucoes IS NOT NULL AND cardinality(instrucoes) <= 20);
ALTER TABLE public.ocorrencias_de_tarefa
  ADD CONSTRAINT ocorrencias_de_tarefa_conclusao_completa CHECK ((concluida_em IS NULL) OR (cancelada_em IS NULL)),
  ADD CONSTRAINT ocorrencias_de_tarefa_checklist CHECK (checklist IS NOT NULL);
ALTER TABLE public.evidencias_de_tarefa
  ADD CONSTRAINT evidencias_de_tarefa_tamanho_positivo CHECK (arquivo_tamanho > 0);

-- Quem é do departamento: alguma tela dele, ou a plataforma.
CREATE FUNCTION plugga_security.no_departamento(departamento text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT plugga_security.plataforma() OR EXISTS (
    SELECT 1 FROM public.user_departamentos d
    WHERE d.user_id = plugga_security.usuario_id() AND d.departamento = $1 AND cardinality(d.telas) > 0
  )
$fn$;
REVOKE ALL ON FUNCTION plugga_security.no_departamento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.no_departamento(text) TO plugga_runtime;

DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['tarefas', 'ocorrencias_de_tarefa', 'evidencias_de_tarefa'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
  END LOOP;
END $regime$;
GRANT SELECT, INSERT, UPDATE ON public.tarefas TO plugga_runtime;
GRANT SELECT, INSERT, UPDATE ON public.ocorrencias_de_tarefa TO plugga_runtime;
GRANT SELECT, INSERT ON public.evidencias_de_tarefa TO plugga_runtime;

CREATE POLICY rls_ler ON public.tarefas FOR SELECT TO plugga_runtime USING (plugga_security.no_departamento(departamento));
CREATE POLICY rls_inserir ON public.tarefas FOR INSERT TO plugga_runtime
  WITH CHECK (plugga_security.no_departamento(departamento) AND criado_por_id = plugga_security.usuario_id());
CREATE POLICY rls_atualizar ON public.tarefas FOR UPDATE TO plugga_runtime
  USING (plugga_security.no_departamento(departamento)) WITH CHECK (plugga_security.no_departamento(departamento));

-- A ocorrência herda o departamento da tarefa (o EXISTS passa pelo RLS de tarefas).
CREATE POLICY rls_ler ON public.ocorrencias_de_tarefa FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id));
CREATE POLICY rls_inserir ON public.ocorrencias_de_tarefa FOR INSERT TO plugga_runtime
  WITH CHECK (concluida_em IS NULL AND EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id));
CREATE POLICY rls_atualizar ON public.ocorrencias_de_tarefa FOR UPDATE TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id));
CREATE POLICY rls_ler ON public.evidencias_de_tarefa FOR SELECT TO plugga_runtime
  USING (EXISTS (SELECT 1 FROM public.ocorrencias_de_tarefa o WHERE o.id = ocorrencia_id));
CREATE POLICY rls_inserir ON public.evidencias_de_tarefa FOR INSERT TO plugga_runtime
  WITH CHECK (enviado_por_id = plugga_security.usuario_id()
    AND EXISTS (SELECT 1 FROM public.ocorrencias_de_tarefa o WHERE o.id = ocorrencia_id AND o.concluida_em IS NULL AND o.cancelada_em IS NULL));

-- A tarefa só muda para encerrar ou avançar a geração; o resto é fixo.
CREATE FUNCTION plugga_security.tarefa_so_encerra() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.departamento, NEW.titulo, NEW.empresa, NEW.tipo, NEW.origem, NEW.regra, NEW.dia, NEW.horario_limite,
      NEW.exige_evidencia, NEW.exige_resultado, NEW.instrucoes, NEW.automacao, NEW.created_at)
     IS DISTINCT FROM (OLD.departamento, OLD.titulo, OLD.empresa, OLD.tipo, OLD.origem, OLD.regra, OLD.dia, OLD.horario_limite,
      OLD.exige_evidencia, OLD.exige_resultado, OLD.instrucoes, OLD.automacao, OLD.created_at)
    OR (OLD.encerrada_em IS NOT NULL AND (NEW.encerrada_em, NEW.encerramento_motivo) IS DISTINCT FROM (OLD.encerrada_em, OLD.encerramento_motivo))
    OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'tarefa só é encerrada, uma vez';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.tarefa_so_encerra() FROM PUBLIC;
CREATE TRIGGER tarefas_so_encerra BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION plugga_security.tarefa_so_encerra();

-- A ocorrência só é concluída ou cancelada, uma vez; o dia e o prazo não mudam.
CREATE FUNCTION plugga_security.ocorrencia_so_conclui() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.tarefa_id, NEW.dia, NEW.prazo_em, NEW.created_at) IS DISTINCT FROM (OLD.tarefa_id, OLD.dia, OLD.prazo_em, OLD.created_at)
    OR ((OLD.concluida_em IS NOT NULL OR OLD.cancelada_em IS NOT NULL)
      AND ((NEW.concluida_em, NEW.cancelada_em, NEW.resultado, NEW.checklist, NEW.automatica)
        IS DISTINCT FROM (OLD.concluida_em, OLD.cancelada_em, OLD.resultado, OLD.checklist, OLD.automatica)
        OR (NEW.concluida_por_id IS DISTINCT FROM OLD.concluida_por_id AND NEW.concluida_por_id IS NOT NULL)))
  THEN
    RAISE EXCEPTION 'ocorrência concluída ou cancelada não muda';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.ocorrencia_so_conclui() FROM PUBLIC;
CREATE TRIGGER ocorrencias_de_tarefa_so_conclui BEFORE UPDATE ON public.ocorrencias_de_tarefa FOR EACH ROW EXECUTE FUNCTION plugga_security.ocorrencia_so_conclui();

-- Pessoas das tarefas: só id e nome. Sem alvos, quem pode ser responsável (ativo,
-- com alguma tela do departamento); com alvos, quem aparece numa tarefa do
-- departamento ou é dele. Função própria para não estender o diretorio().
CREATE FUNCTION plugga_security.pessoas_de_tarefas(departamento text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.name FROM public.users u
  WHERE plugga_security.no_departamento($1)
    AND (
      ($2 IS NULL AND u.status = 'active' AND EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = $1 AND cardinality(d.telas) > 0))
      OR ($2 IS NOT NULL AND u.id = ANY($2) AND (
        EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = $1)
        OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.departamento = $1 AND u.id IN (t.responsavel_id, t.substituto_id, t.criado_por_id, t.encerrada_por_id))
        OR EXISTS (SELECT 1 FROM public.ocorrencias_de_tarefa o JOIN public.tarefas t ON t.id = o.tarefa_id WHERE t.departamento = $1 AND o.concluida_por_id = u.id)))
    )
  ORDER BY u.name
$fn$;
REVOKE ALL ON FUNCTION plugga_security.pessoas_de_tarefas(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.pessoas_de_tarefas(text, uuid[]) TO plugga_runtime;

COMMIT;
