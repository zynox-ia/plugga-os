import { alcancaTela, type Acesso, type Tela } from "@plugga/shared";

const paginas: ReadonlyArray<readonly [string, Tela]> = [
  ["/clientes", "crm.clientes"],
  ["/comercial/pipelines", "crm.pipelines"],
  ["/comercial/oportunidades", "crm.pipelines"],
  ["/crm", "crm.pipelines"],
  ["/comercial/contratos", "crm.contratos"],
];

export function podeAbrirPagina(acesso: Acesso, pathname: string): boolean {
  const pagina = paginas.find(([prefixo]) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
  return !pagina || alcancaTela(acesso, pagina[1]);
}
