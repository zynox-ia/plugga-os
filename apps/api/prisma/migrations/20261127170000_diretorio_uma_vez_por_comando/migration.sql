-- O diretório é avaliado uma vez por comando, e não uma vez por pessoa (PLU-344).
--
-- As políticas de users, user_departamentos e user_platform_roles chamavam
-- diretorio(id) com o id da linha. A função é SECURITY DEFINER (não é inlinada),
-- então cada pessoa pagava a chamada, a leitura da sessão (usuário, plataforma,
-- telas) e os EXISTS em negócios, histórico, pedidos etc. Embrulhar a chamada em
-- (SELECT ...) não resolve, porque o argumento é a própria linha.
--
-- Agora diretorio_visivel() devolve, uma vez, o conjunto de pessoas que a sessão
-- vê, e a política testa a pertença: `id IN (SELECT ...)` sem correlação vira um
-- SubPlan com hash, montado uma vez por comando. A sessão é lida uma vez e cada
-- ramo só roda se a sessão tem as telas dele (filtro de uma vez só). A regra é a
-- mesma de 20261123096000_diretorio_le_a_sessao_uma_vez, ramo por ramo:
-- - sem sessão ativa: ninguém;
-- - plataforma (admin ou desenvolvedor): todas as pessoas;
-- - a própria pessoa;
-- - crm.pipelines: quem é dono ou criador de negócio, está no histórico de um
--   negócio, é membro de pipeline ou dono de oportunidade;
-- - crm.clientes: dono de cliente;
-- - crm.contratos ou Financeiro: dono de contrato;
-- - alguma tela do CRM: pessoa ativa com papel de plataforma, ou pessoa ativa do
--   CRM com uma tela do CRM que a sessão também tem;
-- - Compras ou Financeiro: quem fez um marco de pedido, etapa, cotação ou
--   lançamento, e pessoa ativa com Compras;
-- - suprimentos.fornecedores: quem criou ou atualizou fornecedor;
-- - suprimentos.estoque: quem registrou movimentação, fez ou encerrou reserva ou
--   criou item.
-- Cada ramo era "existe uma linha com a coluna = alvo"; aqui é "os valores da
-- coluna", e a política só pergunta por ids de pessoas, então o resultado é o
-- mesmo. A matriz em test/diretorio-visibilidade.integration.spec.ts fixa quem vê
-- quem, sessão por sessão.
--
-- Medido no banco de teste, como plugga_runtime, com 301 pessoas na sessão de um
-- membro do CRM: users inteira de ~229 ms para ~1 ms; a busca por id de ~3 ms
-- para ~1 ms; user_departamentos inteira de ~164 ms para ~1 ms.
BEGIN;

CREATE FUNCTION plugga_security.diretorio_visivel() RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_eu uuid := plugga_security.usuario_id();
  v_plataforma boolean;
  v_telas text[];
  v_financeiro CONSTANT text[] := ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'];
  v_telas_crm CONSTANT text[] := ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos'];
  v_pipelines boolean;
  v_clientes boolean;
  v_contratos boolean;
  v_crm boolean;
  v_compras boolean;
  v_fornecedores boolean;
  v_estoque boolean;
BEGIN
  IF v_eu IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_platform_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = v_eu AND r.key IN ('desenvolvedor', 'admin')),
    coalesce((SELECT array_agg(t.tela) FROM public.user_departamentos d CROSS JOIN LATERAL unnest(d.telas) t(tela)
      WHERE d.user_id = v_eu AND split_part(t.tela, '.', 1) = d.departamento), '{}'::text[])
  INTO v_plataforma, v_telas;

  IF v_plataforma THEN
    RETURN QUERY SELECT u.id FROM public.users u;
    RETURN;
  END IF;

  v_pipelines := 'crm.pipelines' = ANY(v_telas);
  v_clientes := 'crm.clientes' = ANY(v_telas);
  v_contratos := v_telas && ('{crm.contratos}'::text[] || v_financeiro);
  v_crm := v_telas && v_telas_crm;
  v_compras := v_telas && ('{suprimentos.compras}'::text[] || v_financeiro);
  v_fornecedores := 'suprimentos.fornecedores' = ANY(v_telas);
  v_estoque := 'suprimentos.estoque' = ANY(v_telas);

  RETURN QUERY
  SELECT x.id FROM (
    SELECT v_eu
    UNION SELECT d.owner_id FROM public.deals d WHERE v_pipelines
    UNION SELECT d.created_by_id FROM public.deals d WHERE v_pipelines
    UNION SELECT h.actor_id FROM public.deal_history h WHERE v_pipelines
    UNION SELECT m.user_id FROM public.pipeline_members m WHERE v_pipelines
    UNION SELECT o.owner_id FROM public.opportunities o WHERE v_pipelines
    UNION SELECT c.owner_id FROM public.clients c WHERE v_clientes
    UNION SELECT c.owner_id FROM public.contracts c WHERE v_contratos
    UNION SELECT p.user_id FROM public.user_platform_roles p JOIN public.users u ON u.id = p.user_id
      WHERE v_crm AND u.status = 'active'
    UNION SELECT d.user_id FROM public.user_departamentos d JOIN public.users u ON u.id = d.user_id
      WHERE v_crm AND u.status = 'active' AND d.departamento = 'crm'
        AND EXISTS (SELECT 1 FROM unnest(d.telas) t(tela) WHERE t.tela = ANY(v_telas_crm) AND t.tela = ANY(v_telas))
    UNION SELECT unnest(ARRAY[p.solicitante_id, p.responsavel_id, p.criado_por_id, p.estoque_decidido_por_id,
        p.selecionou_cotacao_id, p.aprovou_id, p.pagamento_registrado_por_id, p.recebimento_confirmado_por_id,
        p.cancelado_por_id]) FROM public.pedidos_de_compra p WHERE v_compras
    UNION SELECT unnest(ARRAY[e.responsavel_id, e.saiu_por_id]) FROM public.pedidos_de_compra_etapas e WHERE v_compras
    UNION SELECT c.criado_por_id FROM public.cotacoes_de_compra c WHERE v_compras
    UNION SELECT unnest(ARRAY[l.criado_por_id, l.aprovado_por_id, l.pagamento_registrado_por_id,
        l.recebimento_registrado_por_id, l.conciliado_por_id, l.cancelado_por_id]) FROM public.lancamentos l WHERE v_compras
    UNION SELECT d.user_id FROM public.user_departamentos d JOIN public.users u ON u.id = d.user_id
      WHERE v_compras AND u.status = 'active' AND d.departamento = 'suprimentos' AND 'suprimentos.compras' = ANY(d.telas)
    UNION SELECT unnest(ARRAY[f.criado_por_id, f.atualizado_por_id]) FROM public.fornecedores f WHERE v_fornecedores
    UNION SELECT m.registrada_por_id FROM public.movimentacoes_de_estoque m WHERE v_estoque
    UNION SELECT unnest(ARRAY[r.reservada_por_id, r.encerrada_por_id]) FROM public.reservas_de_estoque r WHERE v_estoque
    UNION SELECT i.criado_por_id FROM public.itens_de_estoque i WHERE v_estoque
  ) x(id)
  WHERE x.id IS NOT NULL;
END
$fn$;

REVOKE ALL ON FUNCTION plugga_security.diretorio_visivel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plugga_security.diretorio_visivel() TO plugga_runtime;

DROP POLICY rls_diretorio ON public.users;
CREATE POLICY rls_diretorio ON public.users FOR SELECT TO plugga_runtime
  USING (id IN (SELECT v FROM plugga_security.diretorio_visivel() v));
DROP POLICY rls_papeis_usuario ON public.user_platform_roles;
CREATE POLICY rls_papeis_usuario ON public.user_platform_roles FOR SELECT TO plugga_runtime
  USING (user_id IN (SELECT v FROM plugga_security.diretorio_visivel() v));
DROP POLICY rls_departamentos_usuario ON public.user_departamentos;
CREATE POLICY rls_departamentos_usuario ON public.user_departamentos FOR SELECT TO plugga_runtime
  USING (user_id IN (SELECT v FROM plugga_security.diretorio_visivel() v));

-- A versão por pessoa sai, para nenhuma política nova voltar a chamá-la linha a linha.
DROP FUNCTION plugga_security.diretorio(uuid);

COMMIT;
