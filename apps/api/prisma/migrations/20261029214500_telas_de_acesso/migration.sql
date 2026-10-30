ALTER TABLE "user_departamentos" ADD COLUMN "telas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserva exatamente o catálogo existente na data da migração.
UPDATE "user_departamentos" SET "telas" = CASE "departamento"
  WHEN 'crm' THEN ARRAY['crm.pipelines','crm.clientes','crm.propostas','crm.contratos']
  WHEN 'energia-opm' THEN ARRAY['energia-opm.ciclos','energia-opm.auditoria','energia-opm.migracao','energia-opm.relatorios','energia-opm.demanda']
  WHEN 'produto-tecnologia' THEN ARRAY['produto-tecnologia.pluggamob','produto-tecnologia.eletropostos','produto-tecnologia.recargas','produto-tecnologia.parceiros','produto-tecnologia.dashboards']
  WHEN 'financeiro' THEN ARRAY['financeiro.pagar','financeiro.receber','financeiro.conciliacao','financeiro.fiscal']
  WHEN 'suprimentos' THEN ARRAY['suprimentos.compras','suprimentos.fornecedores','suprimentos.estoque']
  WHEN 'engenharia-obras' THEN ARRAY['engenharia-obras.obras','engenharia-obras.projetos','engenharia-obras.os','engenharia-obras.instalacoes','engenharia-obras.manutencao','engenharia-obras.visitas','engenharia-obras.usinas','engenharia-obras.relatorios']
  WHEN 'marketing' THEN ARRAY['marketing.campanhas']
  ELSE ARRAY[]::TEXT[] END;
