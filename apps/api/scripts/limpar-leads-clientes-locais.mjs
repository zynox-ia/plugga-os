import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { assertSafeDockerTarget } from "../../../scripts/local-test.mjs";

// Só dados sintéticos locais. A prévia é obrigatória; --apply exige uma prévia
// aprovada e, no dev, os números autorizados pelo coordenador nesta tarefa.
const devAprovado = { clients: 499, deals: 1080, deal_history: 1231, deal_tags: 18, client_contacts: 11, consumer_units: 1 };
const tabelas = [
  "clients", "deals", "deal_tags", "deal_history", "deal_consumer_units", "client_contacts", "consumer_units",
  "contracts", "cycles", "market_migrations", "energy_efficiency_studies", "audits", "contestations",
  "opportunities", "opportunity_contacts", "obras", "obra_etapas_historico", "evidencias_de_obra", "registros_epi",
  "registros_apr", "incidentes", "liberacoes_seguranca", "pendencias_de_campo", "medicoes_tecnicas", "projeto_versoes",
  "pedidos_de_compra", "itens_de_pedido", "pedidos_de_compra_etapas", "cotacoes_de_compra", "lead_documents", "lead_profiles", "lead_contacts",
];
const fksAprovadas = [
  "audits_cycle_id_fkey", "audits_market_migration_id_fkey", "client_contacts_client_id_fkey", "consumer_units_client_id_fkey",
  "contestations_audit_id_fkey", "contracts_client_id_fkey", "contracts_opportunity_id_fkey", "cotacoes_de_compra_pedido_id_fkey",
  "cycles_client_id_fkey", "cycles_consumer_unit_id_fkey", "cycles_market_migration_id_fkey", "deal_consumer_units_consumer_unit_id_fkey",
  "deal_consumer_units_deal_id_fkey", "deal_history_deal_id_fkey", "deal_tags_deal_id_fkey", "deals_client_id_fkey", "deals_contact_id_fkey",
  "deals_lead_contact_owner_fkey", "energy_efficiency_studies_client_id_fkey", "energy_efficiency_studies_consumer_unit_id_fkey",
  "evidencias_de_obra_obra_id_fkey", "incidentes_obra_id_fkey", "itens_de_pedido_pedido_id_fkey", "lead_contacts_deal_id_fkey",
  "lead_documents_deal_id_fkey", "lead_profiles_deal_id_fkey", "liberacoes_seguranca_incidente_id_fkey", "liberacoes_seguranca_obra_id_fkey",
  "market_migrations_client_id_fkey", "market_migrations_consumer_unit_id_fkey", "medicoes_tecnicas_obra_id_fkey", "obra_etapas_historico_obra_id_fkey",
  "obras_client_id_fkey", "opportunities_client_id_fkey", "opportunity_contacts_opportunity_id_fkey", "pedidos_de_compra_client_id_fkey",
  "pedidos_de_compra_cotacao_selecionada_id_fkey", "pedidos_de_compra_obra_id_fkey", "pedidos_de_compra_etapas_pedido_id_fkey",
  "pendencias_de_campo_obra_id_fkey", "projeto_versoes_obra_id_fkey", "registros_apr_obra_id_fkey", "registros_epi_obra_id_fkey",
].sort();
const fksSetNull = new Set(["deals_contact_id_fkey", "contracts_opportunity_id_fkey", "cycles_market_migration_id_fkey", "market_migrations_client_id_fkey", "obras_client_id_fkey", "opportunities_client_id_fkey", "pedidos_de_compra_client_id_fkey", "pedidos_de_compra_obra_id_fkey", "pedidos_de_compra_cotacao_selecionada_id_fkey", "liberacoes_seguranca_incidente_id_fkey"]);
const fksRestritas = new Set(["deals_client_id_fkey", "lead_documents_deal_id_fkey", "energy_efficiency_studies_client_id_fkey", "energy_efficiency_studies_consumer_unit_id_fkey"]);

export function validarDestino(rawUrl, nodeEnv) {
  if (nodeEnv === "production") throw new Error("Recusado: ambiente de produção.");
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("DATABASE_URL inválida."); }
  const destinos = { "54432": { banco: "plugga_os", container: "plugga-os-postgres-1" }, "54433": { banco: "plugga_os_test", container: "plugga-os-agente-test-pg" } };
  const destino = destinos[url.port];
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || !destino || url.pathname !== `/${destino.banco}` || [...url.searchParams].some(([k, v]) => k !== "schema" || v !== "public") || url.hash) {
    throw new Error("Recusado: banco fora dos alvos locais permitidos.");
  }
  return { ...destino, porta: url.port };
}

function inspecionarContainer(destino) {
  assertSafeDockerTarget();
  const resultado = spawnSync("docker", ["inspect", "--type", "container", destino.container], { encoding: "utf8", windowsHide: true });
  if (resultado.status !== 0) throw new Error("Recusado: container local não encontrado.");
  const [container] = JSON.parse(resultado.stdout);
  const portas = container.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  const ips = Object.values(container.NetworkSettings?.Networks ?? {}).map((rede) => rede.IPAddress).filter(Boolean);
  if (!container.State?.Running || !portas.some((p) => p.HostIp === "127.0.0.1" && p.HostPort === destino.porta) || ips.length === 0) throw new Error("Recusado: porta não pertence ao container local esperado.");
  return ips;
}

const contagemSql = `
WITH a AS (SELECT id FROM audits WHERE cycle_id IS NOT NULL OR market_migration_id IS NOT NULL),
o AS (SELECT id FROM opportunities WHERE client_id IS NOT NULL),
w AS (SELECT id FROM obras WHERE client_id IS NOT NULL),
p AS (SELECT id FROM pedidos_de_compra WHERE client_id IS NOT NULL OR obra_id IN (SELECT id FROM w))
SELECT * FROM (
 SELECT 'clients' AS tabela,count(*)::int AS quantidade FROM clients UNION ALL
 SELECT 'deals',count(*)::int FROM deals UNION ALL SELECT 'deal_tags',count(*)::int FROM deal_tags UNION ALL
 SELECT 'deal_history',count(*)::int FROM deal_history UNION ALL SELECT 'deal_consumer_units',count(*)::int FROM deal_consumer_units UNION ALL
 SELECT 'client_contacts',count(*)::int FROM client_contacts UNION ALL SELECT 'consumer_units',count(*)::int FROM consumer_units UNION ALL
 SELECT 'contracts',count(*)::int FROM contracts UNION ALL SELECT 'cycles',count(*)::int FROM cycles UNION ALL
 SELECT 'market_migrations',count(*)::int FROM market_migrations UNION ALL SELECT 'energy_efficiency_studies',count(*)::int FROM energy_efficiency_studies UNION ALL
 SELECT 'audits',count(*)::int FROM a UNION ALL SELECT 'contestations',count(*)::int FROM contestations WHERE audit_id IN (SELECT id FROM a) UNION ALL
 SELECT 'opportunities',count(*)::int FROM o UNION ALL SELECT 'opportunity_contacts',count(*)::int FROM opportunity_contacts WHERE opportunity_id IN (SELECT id FROM o) UNION ALL
 SELECT 'obras',count(*)::int FROM w UNION ALL SELECT 'obra_etapas_historico',count(*)::int FROM obra_etapas_historico WHERE obra_id IN (SELECT id FROM w) UNION ALL
 SELECT 'evidencias_de_obra',count(*)::int FROM evidencias_de_obra WHERE obra_id IN (SELECT id FROM w) UNION ALL
 SELECT 'registros_epi',count(*)::int FROM registros_epi WHERE obra_id IN (SELECT id FROM w) UNION ALL SELECT 'registros_apr',count(*)::int FROM registros_apr WHERE obra_id IN (SELECT id FROM w) UNION ALL
 SELECT 'incidentes',count(*)::int FROM incidentes WHERE obra_id IN (SELECT id FROM w) UNION ALL SELECT 'liberacoes_seguranca',count(*)::int FROM liberacoes_seguranca WHERE obra_id IN (SELECT id FROM w) UNION ALL
 SELECT 'pendencias_de_campo',count(*)::int FROM pendencias_de_campo WHERE obra_id IN (SELECT id FROM w) UNION ALL SELECT 'medicoes_tecnicas',count(*)::int FROM medicoes_tecnicas WHERE obra_id IN (SELECT id FROM w) UNION ALL
 SELECT 'projeto_versoes',count(*)::int FROM projeto_versoes WHERE obra_id IN (SELECT id FROM w) UNION ALL SELECT 'pedidos_de_compra',count(*)::int FROM p UNION ALL
 SELECT 'itens_de_pedido',count(*)::int FROM itens_de_pedido WHERE pedido_id IN (SELECT id FROM p) UNION ALL SELECT 'pedidos_de_compra_etapas',count(*)::int FROM pedidos_de_compra_etapas WHERE pedido_id IN (SELECT id FROM p) UNION ALL
 SELECT 'cotacoes_de_compra',count(*)::int FROM cotacoes_de_compra WHERE pedido_id IN (SELECT id FROM p) UNION ALL
 SELECT 'lead_documents',count(*)::int FROM lead_documents UNION ALL SELECT 'lead_profiles',count(*)::int FROM lead_profiles UNION ALL SELECT 'lead_contacts',count(*)::int FROM lead_contacts
) x ORDER BY tabela`;

const catalogoSql = `WITH RECURSIVE deps(relid,path) AS (
 SELECT c.oid,ARRAY[c.oid] FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('clients','deals')
 UNION ALL SELECT con.conrelid,d.path||con.conrelid FROM deps d JOIN pg_constraint con ON con.confrelid=d.relid AND con.contype='f' WHERE NOT con.conrelid=ANY(d.path)
)
SELECT DISTINCT child.relname AS tabela,con.conname AS nome,pg_get_constraintdef(con.oid) AS definicao
FROM deps d JOIN pg_constraint con ON con.confrelid=d.relid AND con.contype='f' JOIN pg_class child ON child.oid=con.conrelid ORDER BY 1,2`;
const gatilhosSql = `SELECT c.relname AS tabela,t.tgname AS nome,t.tgenabled AS ativo,pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2`;

export function validarPrevia(atual, aprovada, destino) {
  if (JSON.stringify(atual) !== JSON.stringify(aprovada)) throw new Error("Recusado: contagem ou dependências mudaram desde a prévia.");
  for (const { tabela, quantidade } of atual.contagens) {
    const esperado = destino.porta === "54432" ? (devAprovado[tabela] ?? 0) : undefined;
    if (esperado !== undefined && quantidade !== esperado) throw new Error(`Recusado: contagem não aprovada em ${tabela}.`);
  }
  for (const item of atual.dependencias) if (!tabelas.includes(item.tabela)) throw new Error(`Recusado: dependência não inventariada em ${item.tabela}.`);
  if (JSON.stringify(atual.dependencias.map((d) => d.nome).sort()) !== JSON.stringify(fksAprovadas)) throw new Error("Recusado: chaves estrangeiras divergentes do inventário aprovado.");
  for (const fk of atual.dependencias) {
    const acao = fk.nome === "deals_lead_contact_owner_fkey" ? null : fksSetNull.has(fk.nome) ? "SET NULL" : fksRestritas.has(fk.nome) ? "RESTRICT" : "CASCADE";
    if (acao ? !fk.definicao.includes(`ON DELETE ${acao}`) : fk.definicao.includes("ON DELETE")) throw new Error(`Recusado: regra de exclusão alterada em ${fk.nome}.`);
  }
  const gatilhos = atual.gatilhos.map((g) => `${g.tabela}.${g.nome}`).sort();
  if (JSON.stringify(gatilhos) !== JSON.stringify(["agent_actions.agent_actions_append_only", "event_log.event_log_append_only", "evidencias_de_obra.evidencias_de_obra_append_only"])) throw new Error("Recusado: gatilhos divergentes do inventário aprovado.");
  if (atual.gatilhos.some((g) => g.ativo !== "O" || !g.definicao.includes("BEFORE DELETE OR UPDATE") || !g.definicao.includes("prevent_audit_mutation()"))) throw new Error("Recusado: proteção append-only alterada.");
  const bloqueadas = ["contracts", "cycles", "market_migrations", "energy_efficiency_studies", "audits", "contestations", "opportunities", "obras", "pedidos_de_compra", "lead_documents"];
  if (atual.contagens.some((x) => bloqueadas.includes(x.tabela) && x.quantidade !== 0)) throw new Error("Recusado: há dependências que exigem nova revisão.");
}

async function executar() {
  const args = process.argv.slice(2);
  if (!(args.length === 1 && args[0] === "--dry-run") && !(args.length === 3 && args[0] === "--apply" && args[1] === "--snapshot")) throw new Error("Use --dry-run ou --apply --snapshot <arquivo aprovado>.");
  const destino = validarDestino(process.env.DATABASE_URL, process.env.NODE_ENV);
  const ips = inspecionarContainer(destino);
  const client = new PrismaClient();
  try {
    await client.$transaction(async (tx) => {
      if (args[0] === "--dry-run") await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const [servidor] = await tx.$queryRawUnsafe("SELECT current_database() AS banco, host(inet_server_addr()) AS endereco, inet_server_port() AS porta");
      if (servidor.banco !== destino.banco || servidor.porta !== 5432 || !ips.includes(servidor.endereco)) throw new Error("Recusado: servidor não corresponde ao container local.");
      if (args[0] === "--apply") await tx.$executeRawUnsafe(`LOCK TABLE ${tabelas.map((t) => `"public"."${t}"`).join(", ")} IN ACCESS EXCLUSIVE MODE`);
      const atual = { contagens: await tx.$queryRawUnsafe(contagemSql), dependencias: await tx.$queryRawUnsafe(catalogoSql), gatilhos: await tx.$queryRawUnsafe(gatilhosSql) };
      if (args[0] === "--dry-run") { console.log(JSON.stringify(atual, null, 2)); return; }
      const aprovada = JSON.parse(readFileSync(args[2], "utf8"));
      validarPrevia(atual, aprovada, destino);
      await tx.$executeRawUnsafe('DELETE FROM "public"."deals"');
      await tx.$executeRawUnsafe('DELETE FROM "public"."clients"');
    }, { timeout: 120_000 });
    if (args[0] === "--apply") console.log("Limpeza concluída somente no banco local validado.");
  } finally { await client.$disconnect(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
  executar().catch((erro) => {
    const mensagem = erro instanceof Error ? erro.message : "";
    console.error(/^(Recusado:|DATABASE_URL inválida\.|Use --dry-run)/.test(mensagem) ? mensagem : "Falha na prévia ou limpeza; nenhuma credencial ou dado foi exibido.");
    process.exitCode = 1;
  });
}
