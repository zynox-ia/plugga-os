-- Tela de Relatórios do Financeiro (PLU-360) no catálogo de telas de acesso
-- (a mesma lista de acesso.ts). O corpo é o de `protocolos_na_distribuidora`
-- com `financeiro.relatorios`; CREATE OR REPLACE preserva dono, grants e a
-- dependência do CHECK. A lista só cresce: as linhas existentes continuam
-- válidas. Nenhuma política muda: o relatório soma os lançamentos pelas
-- políticas que já existem (saídas com `financeiro.pagar`, entradas com
-- `financeiro.receber`).

BEGIN;

CREATE OR REPLACE FUNCTION plugga_security.telas_coerentes(p_departamento text, p_telas text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT $2 IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest($2) t WHERE t IS NULL)
    AND cardinality($2) = (SELECT count(DISTINCT t) FROM unnest($2) t)
    AND coalesce($2 <@ CASE $1
      WHEN 'crm' THEN ARRAY['crm.pipelines', 'crm.clientes', 'crm.propostas', 'crm.contratos']
      WHEN 'energia-opm' THEN ARRAY['energia-opm.ciclos', 'energia-opm.auditoria', 'energia-opm.migracao', 'energia-opm.relatorios', 'energia-opm.demanda', 'energia-opm.protocolos']
      WHEN 'produto-tecnologia' THEN ARRAY['produto-tecnologia.pluggamob', 'produto-tecnologia.eletropostos', 'produto-tecnologia.recargas', 'produto-tecnologia.parceiros', 'produto-tecnologia.dashboards']
      WHEN 'financeiro' THEN ARRAY['financeiro.pagar', 'financeiro.receber', 'financeiro.conciliacao', 'financeiro.fiscal', 'financeiro.relatorios']
      WHEN 'suprimentos' THEN ARRAY['suprimentos.compras', 'suprimentos.fornecedores', 'suprimentos.estoque']
      WHEN 'engenharia-obras' THEN ARRAY['engenharia-obras.obras', 'engenharia-obras.projetos', 'engenharia-obras.os', 'engenharia-obras.instalacoes', 'engenharia-obras.manutencao', 'engenharia-obras.visitas', 'engenharia-obras.usinas', 'engenharia-obras.relatorios', 'engenharia-obras.protocolos']
    END, false)
$fn$;

COMMIT;
