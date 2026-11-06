import { alcancaPlataforma, alcancaTela, papelDoAcesso, type Acesso, type Tela } from "@plugga/shared";

const paginas: ReadonlyArray<readonly [string, Tela]> = [
  ["/clientes", "crm.clientes"],
  ["/comercial/pipelines", "crm.pipelines"],
  ["/comercial/oportunidades", "crm.pipelines"],
  ["/comercial/atividades", "crm.pipelines"],
  ["/crm", "crm.pipelines"],
  ["/documentos", "crm.pipelines"],
  ["/comercial/contratos", "crm.contratos"],
];

export function podeAbrirPagina(acesso: Acesso, pathname: string): boolean {
  if (["/", "/configuracoes", "/agentes-ia", "/auth/google/complete"].includes(pathname)) return true;
  if (pathname === "/administracao") return papelDoAcesso(acesso) !== "membro";
  if (pathname === "/integracoes") return alcancaPlataforma(acesso, "admin");
  if (["/jobs", "/estrutura"].includes(pathname) || pathname === "/design-system" || pathname.startsWith("/design-system/")) {
    return alcancaPlataforma(acesso, "desenvolvedor");
  }
  const pagina = paginas.find(([prefixo]) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
  // Tela nova precisa declarar acesso antes de ficar disponível por URL.
  return pagina !== undefined && alcancaTela(acesso, pagina[1]);
}
