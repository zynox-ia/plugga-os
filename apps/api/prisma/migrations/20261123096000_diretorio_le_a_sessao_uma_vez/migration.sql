-- O diretório lê a sessão uma vez por chamada (CI do isolamento-membros :919).
--
-- O diretório está no RLS de `users`, e uma consulta avalia a função em cada linha
-- que toca. A checagem de responsável elegível do POST /leads, mesmo filtrada pelo
-- id, a avalia na pessoa, nas linhas de papéis de plataforma e nas de departamento
-- do CRM. Cada chamada fazia cerca de dez chamadas SECURITY DEFINER aninhadas: cada
-- tem_tela() chama plataforma() e usuario_id(), e plataforma() chama usuario_id() de
-- novo. Com as 8 criações concorrentes do teste em fila no advisory lock da etapa,
-- o pool esgotava e algumas respostas saíam 503. Pior: o Postgres resolve o
-- EXISTS em user_departamentos como "hashed SubPlan", que avalia o RLS daquela
-- tabela (o diretório) em todas as linhas de CRM do banco, então o custo cresce com
-- o número de pessoas e a CI oscilava entre ~6 s e ~14 s no mesmo commit.
--
-- Agora o usuário da sessão, se ele é da plataforma e as telas dele são lidos uma
-- vez, no início da chamada; cada tem_tela(ARRAY[...]) vira um teste de array. A
-- regra é a mesma da versão de 20261123092000_diretorio_financeiro_barato:
-- - tem_tela(telas) = plataforma() OR uma das telas está num departamento da pessoa
--   com o prefixo do próprio departamento. O primeiro ramo já devolve true para a
--   plataforma, então nos ramos seguintes basta o teste das telas;
-- - plataforma() = papel `admin` ou `desenvolvedor` (sem o modo técnico).
-- Medido no banco de teste, como plugga_runtime e com a mesma resposta para 300
-- pessoas em sessões de CRM, Financeiro, Compras/Estoque e sem sessão: uma chamada
-- de ~140 ms para 1-2,5 ms; a checagem de elegível do POST /leads de 2,6-4,7 s para
-- 35-62 ms; o diretório das 300 pessoas de 8-260 s para ~0,3 s.
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  -- MATERIALIZED: sem ele o Postgres inlina o CTE, o usuario_id() vira filtro
  -- avaliado em cada linha de user_departamentos e o subselect das telas se repete
  -- em cada referência a s.telas.
  WITH eu AS MATERIALIZED (SELECT plugga_security.usuario_id() AS id),
  sessao AS MATERIALIZED (
    SELECT eu.id,
      EXISTS (SELECT 1 FROM public.user_platform_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = eu.id AND r.key IN ('desenvolvedor', 'admin')) AS plataforma,
      coalesce((SELECT array_agg(t.tela) FROM public.user_departamentos d CROSS JOIN LATERAL unnest(d.telas) t(tela)
        WHERE d.user_id = eu.id AND split_part(t.tela, '.', 1) = d.departamento), '{}'::text[]) AS telas
    FROM eu
  )
  SELECT $1 = s.id OR s.plataforma
    OR ('crm.pipelines' = ANY(s.telas) AND (
      EXISTS (SELECT 1 FROM public.deals d WHERE d.owner_id = $1 OR d.created_by_id = $1)
      OR EXISTS (SELECT 1 FROM public.deal_history h WHERE h.actor_id = $1)
      OR EXISTS (SELECT 1 FROM public.pipeline_members m WHERE m.user_id = $1)
      OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.owner_id = $1)
    ))
    OR ('crm.clientes' = ANY(s.telas) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.owner_id = $1))
    OR (s.telas && ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.owner_id = $1))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active') AND (
      (s.telas && ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos']
        AND EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = $1))
      OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = $1 AND d.departamento = 'crm'
        AND EXISTS (SELECT 1 FROM unnest(d.telas) t(tela)
          WHERE t.tela IN ('crm.clientes', 'crm.pipelines', 'crm.contratos') AND t.tela = ANY(s.telas)))
    ))
    OR (s.telas && ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'] AND (
      EXISTS (SELECT 1 FROM public.pedidos_de_compra p WHERE $1 IN (p.solicitante_id, p.responsavel_id, p.criado_por_id,
        p.estoque_decidido_por_id, p.selecionou_cotacao_id, p.aprovou_id, p.pagamento_registrado_por_id,
        p.recebimento_confirmado_por_id, p.cancelado_por_id))
      OR EXISTS (SELECT 1 FROM public.pedidos_de_compra_etapas e WHERE e.responsavel_id = $1 OR e.saiu_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.cotacoes_de_compra c WHERE c.criado_por_id = $1)
      -- Quem fez um marco de um lançamento (o RLS de lancamentos recorta o resto).
      OR EXISTS (SELECT 1 FROM public.lancamentos l WHERE $1 IN (l.criado_por_id, l.aprovado_por_id, l.pagamento_registrado_por_id,
        l.recebimento_registrado_por_id, l.conciliado_por_id, l.cancelado_por_id))
      -- Quem pode ser solicitante ou responsável: pessoa ativa com Compras.
      OR EXISTS (SELECT 1 FROM public.users u JOIN public.user_departamentos d ON d.user_id = u.id
        WHERE u.id = $1 AND u.status = 'active' AND d.departamento = 'suprimentos' AND 'suprimentos.compras' = ANY(d.telas))
    ))
    OR ('suprimentos.fornecedores' = ANY(s.telas)
      AND EXISTS (SELECT 1 FROM public.fornecedores f WHERE f.criado_por_id = $1 OR f.atualizado_por_id = $1))
    OR ('suprimentos.estoque' = ANY(s.telas) AND (
      EXISTS (SELECT 1 FROM public.movimentacoes_de_estoque m WHERE m.registrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.reservas_de_estoque r WHERE r.reservada_por_id = $1 OR r.encerrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.itens_de_estoque i WHERE i.criado_por_id = $1)
    ))
  FROM sessao s
$fn$;

COMMIT;
