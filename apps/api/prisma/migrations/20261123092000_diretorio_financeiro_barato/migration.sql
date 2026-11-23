-- O diretório sem o custo do ramo do Financeiro (PLU-336). A versão de
-- 20261123080000_financeiro_lancamentos acrescentou um ramo próprio, com mais uma
-- chamada a tem_tela() por pessoa avaliada. Como o diretório entra no RLS de `users`,
-- isso pesava em todo o sistema: medido no banco de teste, 301 pessoas na sessão de
-- um membro do CRM, mediana de 5 rodadas, 8.406 ms antes do Financeiro, 10.807 ms com
-- o ramo (+29%) e 8.576 ms com esta versão (+2%). Na CI, as 8 criações concorrentes de
-- lead do isolamento-membros chegavam a estourar o tempo do pool (503).
--
-- Agora quem fez um marco de um lançamento entra no ramo de Compras e Financeiro,
-- que já confere essas telas: nenhuma chamada nova a tem_tela(). Quem tem só Compras
-- passa a ver o nome de quem fez um marco de um lançamento (só id e nome, como os
-- autores de pedido que o Financeiro já vê); o lançamento em si segue recortado pelo RLS.
BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.diretorio(alvo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $1 = plugga_security.usuario_id() OR plugga_security.plataforma()
    OR (plugga_security.tem_tela(ARRAY['crm.pipelines']) AND (
      EXISTS (SELECT 1 FROM public.deals d WHERE d.owner_id = $1 OR d.created_by_id = $1)
      OR EXISTS (SELECT 1 FROM public.deal_history h WHERE h.actor_id = $1)
      OR EXISTS (SELECT 1 FROM public.pipeline_members m WHERE m.user_id = $1)
      OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.owner_id = $1)
    ))
    OR (plugga_security.tem_tela(ARRAY['crm.clientes']) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.owner_id = $1))
    OR (plugga_security.tem_tela(ARRAY['crm.contratos', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal'])
      AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.owner_id = $1))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active') AND (
      (plugga_security.tem_tela(ARRAY['crm.clientes', 'crm.pipelines', 'crm.contratos'])
        AND EXISTS (SELECT 1 FROM public.user_platform_roles p WHERE p.user_id = $1))
      OR EXISTS (SELECT 1 FROM public.user_departamentos d WHERE d.user_id = $1 AND d.departamento = 'crm'
        AND EXISTS (SELECT 1 FROM unnest(d.telas) t(tela)
          WHERE t.tela IN ('crm.clientes', 'crm.pipelines', 'crm.contratos') AND plugga_security.tem_tela(ARRAY[t.tela])))
    ))
    OR (plugga_security.tem_tela(ARRAY['suprimentos.compras', 'financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal']) AND (
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
    OR (plugga_security.tem_tela(ARRAY['suprimentos.fornecedores'])
      AND EXISTS (SELECT 1 FROM public.fornecedores f WHERE f.criado_por_id = $1 OR f.atualizado_por_id = $1))
    OR (plugga_security.tem_tela(ARRAY['suprimentos.estoque']) AND (
      EXISTS (SELECT 1 FROM public.movimentacoes_de_estoque m WHERE m.registrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.reservas_de_estoque r WHERE r.reservada_por_id = $1 OR r.encerrada_por_id = $1)
      OR EXISTS (SELECT 1 FROM public.itens_de_estoque i WHERE i.criado_por_id = $1)
    ))
$fn$;

COMMIT;
