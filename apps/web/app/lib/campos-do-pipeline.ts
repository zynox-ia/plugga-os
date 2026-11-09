import type { PipelineField } from "@plugga/shared";

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function campoCorrespondeAoFiltro(campo: PipelineField, valor: string | boolean | null | undefined, filtro: string, pessoas: readonly { id: string; name: string }[] = []): boolean {
  if (!filtro.trim()) return true;
  if (valor === null || valor === undefined || valor === "") return false;
  const texto = normalizar(formatarCampoDoPipeline(campo, valor, pessoas));
  return campo.type === "boolean" ? texto === normalizar(filtro) : texto.includes(normalizar(filtro));
}

export function formatarCampoDoPipeline(campo: PipelineField, valor: string | boolean | null | undefined, pessoas: readonly { id: string; name: string }[] = []): string {
  if (valor === null || valor === undefined || valor === "") return "Não informado";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (campo.type === "select") return campo.options.find((opcao) => opcao.id === valor)?.name ?? "Opção indisponível";
  if (campo.type === "person") return pessoas.find((pessoa) => pessoa.id === valor)?.name ?? "Pessoa indisponível";
  if (campo.type === "date") return valor.split("-").reverse().join("/");
  if (campo.type === "money" || campo.type === "number") {
    const [inteiro = "0", fracao = ""] = valor.split(".");
    const sinal = inteiro.startsWith("-") ? "-" : "";
    const agrupado = BigInt(inteiro.replace(/^-/, "")).toLocaleString("pt-BR");
    if (campo.type === "money") return `${sinal}R$ ${agrupado},${fracao.padEnd(2, "0")}`;
    return `${sinal}${agrupado}${fracao ? `,${fracao}` : ""}`;
  }
  return valor;
}
