-- Engenharia e Obras (PLU-345): a ordem de serviço, no lugar das tarefas
-- "O.S ..." do Bitrix. Protótipo aprovado pelo André em 23/11/2026.
--
--   * numeração global (OS-0001), empresa como campo obrigatório e filtro;
--   * ciclo aberta → agendada → em_campo → laudo → concluida, mais adiada e
--     cancelada, com os dados de cada situação garantidos por CHECK;
--   * linha do tempo, arquivos (fotos, assinatura, PDF do termo) e termo sem
--     DELETE; histórico e termo também sem UPDATE; a O.S. encerrada não muda;
--   * pedido de material: o pedido de compra ganha a origem na O.S., e quem é
--     da Engenharia cria e lê só os pedidos das O.S. que enxerga;
--   * funções que entregam só id e nome de clientes, UCs e pessoas para a O.S.,
--     sem estender o diretorio() (que entra no RLS de users).

BEGIN;

CREATE TYPE "public"."tipo_de_ordem_de_servico" AS ENUM ('manutencao', 'limpeza', 'garantia', 'emergencia', 'visita_tecnica', 'instalacao', 'configuracao', 'comissionamento', 'orcamento_tecnico', 'eletroposto', 'grid_zero_bess', 'analise_energia', 'outros');

CREATE TYPE "public"."situacao_da_ordem_de_servico" AS ENUM ('aberta', 'agendada', 'em_campo', 'laudo', 'concluida', 'adiada', 'cancelada');

CREATE TYPE "public"."prioridade_da_ordem_de_servico" AS ENUM ('baixa', 'normal', 'alta', 'urgente');

CREATE TYPE "public"."origem_da_ordem_de_servico" AS ENUM ('manual', 'monitoramento', 'crm', 'robo');

CREATE TYPE "public"."modo_de_assinatura_do_termo" AS ENUM ('desenhada', 'nome_digitado', 'pdf_externo');

CREATE TYPE "public"."categoria_de_arquivo_da_ordem" AS ENUM ('foto', 'assinatura', 'termo_pdf');

ALTER TABLE "public"."pedidos_de_compra" ADD COLUMN     "ordem_de_servico_id" UUID;

CREATE TABLE "public"."ordens_de_servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "tipo" "public"."tipo_de_ordem_de_servico" NOT NULL,
    "situacao" "public"."situacao_da_ordem_de_servico" NOT NULL DEFAULT 'aberta',
    "prioridade" "public"."prioridade_da_ordem_de_servico" NOT NULL DEFAULT 'normal',
    "origem" "public"."origem_da_ordem_de_servico" NOT NULL DEFAULT 'manual',
    "canal" TEXT,
    "client_id" UUID NOT NULL,
    "consumer_unit_id" UUID,
    "local" TEXT,
    "descricao" TEXT NOT NULL,
    "prazo" TIMESTAMPTZ(6) NOT NULL,
    "equipamento" TEXT,
    "fabricante" TEXT,
    "modelo" TEXT,
    "numero_serie" TEXT,
    "tecnico_id" UUID,
    "apoio_id" UUID,
    "agendada_para" TIMESTAMPTZ(6),
    "checkin_em" TIMESTAMPTZ(6),
    "laudo_encontrado" TEXT,
    "laudo_feito" TEXT,
    "laudo_recomendacao" TEXT,
    "laudo_em" TIMESTAMPTZ(6),
    "laudo_por_id" UUID,
    "adiamento_motivo" TEXT,
    "adiada_para" TIMESTAMPTZ(6),
    "adiada_em" TIMESTAMPTZ(6),
    "adiada_por_id" UUID,
    "cancelamento_motivo" TEXT,
    "cancelada_em" TIMESTAMPTZ(6),
    "cancelada_por_id" UUID,
    "cancelada_em_situacao" "public"."situacao_da_ordem_de_servico",
    "concluida_em" TIMESTAMPTZ(6),
    "ordem_anterior_id" UUID,
    "criado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ordens_de_servico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."historico_de_ordens_de_servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ordem_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "detalhe" TEXT,
    "por_id" UUID,
    "em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_de_ordens_de_servico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."arquivos_de_ordens_de_servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ordem_id" UUID NOT NULL,
    "categoria" "public"."categoria_de_arquivo_da_ordem" NOT NULL,
    "arquivo_chave" TEXT NOT NULL,
    "arquivo_nome" TEXT NOT NULL,
    "arquivo_tamanho" INTEGER NOT NULL,
    "arquivo_tipo" TEXT NOT NULL,
    "enviado_por_id" UUID,
    "enviado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "substituido_em" TIMESTAMPTZ(6),
    "substituido_por_id" UUID,

    CONSTRAINT "arquivos_de_ordens_de_servico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."termos_de_ordens_de_servico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ordem_id" UUID NOT NULL,
    "modo" "public"."modo_de_assinatura_do_termo" NOT NULL,
    "nome" TEXT,
    "documento" TEXT,
    "assinatura_arquivo_id" UUID,
    "pdf_arquivo_id" UUID NOT NULL,
    "coletado_por_id" UUID,
    "assinado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termos_de_ordens_de_servico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordens_de_servico_numero_key" ON "public"."ordens_de_servico"("numero");

CREATE INDEX "ordens_de_servico_situacao_created_at_idx" ON "public"."ordens_de_servico"("situacao", "created_at");

CREATE INDEX "ordens_de_servico_tecnico_id_agendada_para_idx" ON "public"."ordens_de_servico"("tecnico_id", "agendada_para");

CREATE INDEX "ordens_de_servico_client_id_idx" ON "public"."ordens_de_servico"("client_id");

CREATE INDEX "historico_de_ordens_de_servico_ordem_id_em_idx" ON "public"."historico_de_ordens_de_servico"("ordem_id", "em");

CREATE INDEX "arquivos_de_ordens_de_servico_ordem_id_categoria_enviado_em_idx" ON "public"."arquivos_de_ordens_de_servico"("ordem_id", "categoria", "enviado_em");

CREATE UNIQUE INDEX "termos_de_ordens_de_servico_ordem_id_key" ON "public"."termos_de_ordens_de_servico"("ordem_id");

CREATE UNIQUE INDEX "termos_de_ordens_de_servico_assinatura_arquivo_id_key" ON "public"."termos_de_ordens_de_servico"("assinatura_arquivo_id");

CREATE UNIQUE INDEX "termos_de_ordens_de_servico_pdf_arquivo_id_key" ON "public"."termos_de_ordens_de_servico"("pdf_arquivo_id");

CREATE INDEX "pedidos_de_compra_ordem_de_servico_id_idx" ON "public"."pedidos_de_compra"("ordem_de_servico_id");

ALTER TABLE "public"."pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_ordem_de_servico_id_fkey" FOREIGN KEY ("ordem_de_servico_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "public"."consumer_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_apoio_id_fkey" FOREIGN KEY ("apoio_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_laudo_por_id_fkey" FOREIGN KEY ("laudo_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_adiada_por_id_fkey" FOREIGN KEY ("adiada_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_ordem_anterior_id_fkey" FOREIGN KEY ("ordem_anterior_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."historico_de_ordens_de_servico" ADD CONSTRAINT "historico_de_ordens_de_servico_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."historico_de_ordens_de_servico" ADD CONSTRAINT "historico_de_ordens_de_servico_por_id_fkey" FOREIGN KEY ("por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."arquivos_de_ordens_de_servico" ADD CONSTRAINT "arquivos_de_ordens_de_servico_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."arquivos_de_ordens_de_servico" ADD CONSTRAINT "arquivos_de_ordens_de_servico_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."arquivos_de_ordens_de_servico" ADD CONSTRAINT "arquivos_de_ordens_de_servico_substituido_por_id_fkey" FOREIGN KEY ("substituido_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."termos_de_ordens_de_servico" ADD CONSTRAINT "termos_de_ordens_de_servico_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."termos_de_ordens_de_servico" ADD CONSTRAINT "termos_de_ordens_de_servico_assinatura_arquivo_id_fkey" FOREIGN KEY ("assinatura_arquivo_id") REFERENCES "public"."arquivos_de_ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."termos_de_ordens_de_servico" ADD CONSTRAINT "termos_de_ordens_de_servico_pdf_arquivo_id_fkey" FOREIGN KEY ("pdf_arquivo_id") REFERENCES "public"."arquivos_de_ordens_de_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."termos_de_ordens_de_servico" ADD CONSTRAINT "termos_de_ordens_de_servico_coletado_por_id_fkey" FOREIGN KEY ("coletado_por_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras que o banco também segura: cada situação com os dados que a exigem.
ALTER TABLE public.ordens_de_servico
  ADD CONSTRAINT ordens_de_servico_agendada_completa CHECK (situacao NOT IN ('agendada', 'em_campo', 'laudo') OR (tecnico_id IS NOT NULL AND agendada_para IS NOT NULL)),
  ADD CONSTRAINT ordens_de_servico_em_campo_com_checkin CHECK (situacao NOT IN ('em_campo', 'laudo') OR checkin_em IS NOT NULL),
  ADD CONSTRAINT ordens_de_servico_laudo_completo CHECK (situacao NOT IN ('laudo', 'concluida') OR (laudo_encontrado IS NOT NULL AND laudo_feito IS NOT NULL AND laudo_em IS NOT NULL)),
  ADD CONSTRAINT ordens_de_servico_concluida_com_data CHECK ((situacao = 'concluida') = (concluida_em IS NOT NULL)),
  ADD CONSTRAINT ordens_de_servico_adiada_completa CHECK (situacao <> 'adiada' OR (adiamento_motivo IS NOT NULL AND adiada_para IS NOT NULL AND adiada_em IS NOT NULL)),
  ADD CONSTRAINT ordens_de_servico_cancelada_completa CHECK ((situacao = 'cancelada') = (cancelada_em IS NOT NULL AND cancelamento_motivo IS NOT NULL AND cancelada_em_situacao IS NOT NULL)),
  ADD CONSTRAINT ordens_de_servico_apoio_distinto CHECK (apoio_id IS NULL OR apoio_id <> tecnico_id),
  ADD CONSTRAINT ordens_de_servico_anterior_distinta CHECK (ordem_anterior_id IS NULL OR ordem_anterior_id <> id);
ALTER TABLE public.arquivos_de_ordens_de_servico
  ADD CONSTRAINT arquivos_de_ordens_de_servico_substituicao_coerente CHECK (substituido_em IS NOT NULL OR substituido_por_id IS NULL),
  ADD CONSTRAINT arquivos_de_ordens_de_servico_tamanho_positivo CHECK (arquivo_tamanho > 0);
ALTER TABLE public.termos_de_ordens_de_servico
  ADD CONSTRAINT termos_de_ordens_de_servico_quem_assina CHECK (modo = 'pdf_externo' OR (nome IS NOT NULL AND documento IS NOT NULL)),
  ADD CONSTRAINT termos_de_ordens_de_servico_desenho CHECK ((modo = 'desenhada') = (assinatura_arquivo_id IS NOT NULL));

-- Mesmo regime das demais tabelas (20261106010000_isolamento_rls): RLS forçado,
-- nada para PUBLIC, leitura do dono só para as funções de segurança. Nenhuma
-- tabela da O.S. tem DELETE; histórico e termo também não têm UPDATE.
DO $regime$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['ordens_de_servico', 'historico_de_ordens_de_servico', 'arquivos_de_ordens_de_servico', 'termos_de_ordens_de_servico'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime', tabela);
    EXECUTE format('CREATE POLICY rls_helper_owner ON public.%I FOR SELECT TO %I USING (true)', tabela, current_user);
    EXECUTE format('CREATE POLICY rls_ler ON public.%I FOR SELECT TO plugga_runtime USING (plugga_security.tem_tela(ARRAY[''engenharia-obras.os'', ''engenharia-obras.instalacoes'', ''engenharia-obras.manutencao'', ''engenharia-obras.visitas'']))', tabela);
    EXECUTE format('CREATE POLICY rls_inserir ON public.%I FOR INSERT TO plugga_runtime WITH CHECK (plugga_security.tem_tela(ARRAY[''engenharia-obras.os'', ''engenharia-obras.instalacoes'', ''engenharia-obras.manutencao'', ''engenharia-obras.visitas'']))', tabela);
  END LOOP;
END $regime$;
GRANT SELECT, INSERT, UPDATE ON public.ordens_de_servico TO plugga_runtime;
GRANT SELECT, INSERT ON public.historico_de_ordens_de_servico TO plugga_runtime;
GRANT SELECT, INSERT, UPDATE ON public.arquivos_de_ordens_de_servico TO plugga_runtime;
GRANT SELECT, INSERT ON public.termos_de_ordens_de_servico TO plugga_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.ordens_de_servico_numero_seq TO plugga_runtime;

CREATE POLICY rls_atualizar ON public.ordens_de_servico FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']));
CREATE POLICY rls_atualizar ON public.arquivos_de_ordens_de_servico FOR UPDATE TO plugga_runtime
  USING (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
  WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']));

-- A O.S. concluída ou cancelada não volta: nenhuma alteração depois do fim,
-- salvo a referência a uma pessoa removida virar nula (ON DELETE SET NULL).
-- Número, cliente, empresa e criação nunca mudam.
CREATE FUNCTION plugga_security.ordem_encerrada_nao_muda() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  pessoas text[] := ARRAY['tecnico_id', 'apoio_id', 'laudo_por_id', 'adiada_por_id', 'cancelada_por_id', 'criado_por_id'];
  coluna text;
BEGIN
  IF (NEW.numero, NEW.client_id, NEW.company_id, NEW.created_at) IS DISTINCT FROM (OLD.numero, OLD.client_id, OLD.company_id, OLD.created_at)
    OR (NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id AND NEW.criado_por_id IS NOT NULL) THEN
    RAISE EXCEPTION 'número, cliente, empresa e criação da ordem de serviço não mudam';
  END IF;
  IF OLD.situacao IN ('concluida', 'cancelada') THEN
    FOREACH coluna IN ARRAY pessoas LOOP
      IF to_jsonb(NEW) -> coluna IS DISTINCT FROM to_jsonb(OLD) -> coluna AND to_jsonb(NEW) -> coluna <> 'null'::jsonb THEN
        RAISE EXCEPTION 'ordem de serviço encerrada não muda';
      END IF;
    END LOOP;
    IF (to_jsonb(NEW) - pessoas - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - pessoas - 'updated_at') THEN
      RAISE EXCEPTION 'ordem de serviço encerrada não muda';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.ordem_encerrada_nao_muda() FROM PUBLIC;
CREATE TRIGGER ordens_de_servico_encerrada_nao_muda BEFORE UPDATE ON public.ordens_de_servico
  FOR EACH ROW EXECUTE FUNCTION plugga_security.ordem_encerrada_nao_muda();

-- O UPDATE do arquivo só marca a substituição, uma vez: o arquivo não muda e o
-- substituído não volta. Quem enviou pode virar nulo (pessoa removida).
CREATE FUNCTION plugga_security.arquivo_de_ordem_so_substitui() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF (NEW.ordem_id, NEW.categoria, NEW.arquivo_chave, NEW.arquivo_nome, NEW.arquivo_tamanho, NEW.arquivo_tipo, NEW.enviado_em)
       IS DISTINCT FROM (OLD.ordem_id, OLD.categoria, OLD.arquivo_chave, OLD.arquivo_nome, OLD.arquivo_tamanho, OLD.arquivo_tipo, OLD.enviado_em)
    OR (NEW.enviado_por_id IS DISTINCT FROM OLD.enviado_por_id AND NEW.enviado_por_id IS NOT NULL)
    OR (OLD.substituido_em IS NOT NULL AND NEW.substituido_em IS DISTINCT FROM OLD.substituido_em)
  THEN
    RAISE EXCEPTION 'arquivo da ordem de serviço só pode ser marcado como substituído, uma vez';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION plugga_security.arquivo_de_ordem_so_substitui() FROM PUBLIC;
CREATE TRIGGER arquivos_de_ordens_de_servico_so_substitui BEFORE UPDATE ON public.arquivos_de_ordens_de_servico
  FOR EACH ROW EXECUTE FUNCTION plugga_security.arquivo_de_ordem_so_substitui();

-- Pedir material (PLU-345): quem é da Engenharia cria pedido de compra só com
-- a origem numa O.S. que enxerga, como solicitante e autor, e lê só esses
-- pedidos (nunca a lista de Compras). Não altera pedido nenhum.
CREATE POLICY rls_ler_da_engenharia ON public.pedidos_de_compra FOR SELECT TO plugga_runtime
  USING (ordem_de_servico_id IS NOT NULL
    AND plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.id = ordem_de_servico_id));
CREATE POLICY rls_inserir_da_engenharia ON public.pedidos_de_compra FOR INSERT TO plugga_runtime
  WITH CHECK (ordem_de_servico_id IS NOT NULL
    AND solicitante_id = plugga_security.usuario_id() AND criado_por_id = plugga_security.usuario_id()
    AND plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.id = ordem_de_servico_id AND o.situacao NOT IN ('concluida', 'cancelada')));
DO $filhos$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['itens_de_pedido', 'pedidos_de_compra_etapas'] LOOP
    EXECUTE format($p$CREATE POLICY rls_ler_da_engenharia ON public.%I FOR SELECT TO plugga_runtime
      USING (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
        AND EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.id = pedido_id AND p.ordem_de_servico_id IS NOT NULL))$p$, tabela);
    EXECUTE format($p$CREATE POLICY rls_inserir_da_engenharia ON public.%I FOR INSERT TO plugga_runtime
      WITH CHECK (plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
        AND EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE p.id = pedido_id AND p.ordem_de_servico_id IS NOT NULL
          AND p.criado_por_id = plugga_security.usuario_id()))$p$, tabela);
  END LOOP;
END $filhos$;

-- Clientes da O.S.: só id e nome, para quem é da Engenharia. A busca entrega
-- clientes ativos; a leitura por id, só os que alguma O.S. referencia.
CREATE FUNCTION plugga_security.clientes_para_engenharia(busca text, alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT c.id, c.name FROM public.clients c
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND (
      ($1 IS NOT NULL AND length(trim($1)) >= 2 AND c.active AND c.name ILIKE '%' || replace(replace(replace(trim($1), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      OR ($2 IS NOT NULL AND c.id = ANY($2) AND EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE o.client_id = c.id))
    )
  ORDER BY c.name
  LIMIT 50
$fn$;
REVOKE ALL ON FUNCTION plugga_security.clientes_para_engenharia(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.clientes_para_engenharia(text, uuid[]) TO plugga_runtime;

-- UCs dos clientes, para escolher onde é o serviço: código e distribuidora.
CREATE FUNCTION plugga_security.ucs_para_engenharia(clientes uuid[])
RETURNS TABLE(id uuid, client_id uuid, code text, distributor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.client_id, u.code, u.distributor FROM public.consumer_units u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND u.client_id = ANY($1)
  ORDER BY u.code
  LIMIT 500
$fn$;
REVOKE ALL ON FUNCTION plugga_security.ucs_para_engenharia(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.ucs_para_engenharia(uuid[]) TO plugga_runtime;

-- Pessoas da O.S.: só id e nome. Sem alvos, quem pode ser técnico (ativo, do
-- departamento, com uma das telas de O.S.); com alvos, quem aparece numa O.S.
-- Função própria para não acrescentar ramo ao diretorio(), que entra no RLS de users.
CREATE FUNCTION plugga_security.pessoas_da_engenharia(alvos uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT u.id, u.name FROM public.users u
  WHERE plugga_security.tem_tela(ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas'])
    AND (
      ($1 IS NULL AND u.status = 'active' AND EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras'
        AND d.telas && ARRAY['engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas']))
      OR ($1 IS NOT NULL AND u.id = ANY($1) AND (
        EXISTS (SELECT 1 FROM public.ordens_de_servico o WHERE u.id IN (o.tecnico_id, o.apoio_id, o.criado_por_id, o.laudo_por_id, o.adiada_por_id, o.cancelada_por_id))
        OR EXISTS (SELECT 1 FROM public.historico_de_ordens_de_servico h WHERE h.por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.arquivos_de_ordens_de_servico a WHERE a.enviado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.termos_de_ordens_de_servico t WHERE t.coletado_por_id = u.id)
        OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = u.id AND d.departamento = 'engenharia-obras')))
    )
  ORDER BY u.name
$fn$;
REVOKE ALL ON FUNCTION plugga_security.pessoas_da_engenharia(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.pessoas_da_engenharia(uuid[]) TO plugga_runtime;

COMMIT;
