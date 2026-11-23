import type { LancamentoResumo, NaturezaDeCategoria } from "@plugga/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  FileText,
  HardHat,
  Landmark,
  Package,
  Phone,
  Receipt,
  Scale,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** O ícone do topo do card, pela natureza da categoria (campo do Plugga OS). */
export const ICONE_DA_NATUREZA: Record<NaturezaDeCategoria, LucideIcon> = {
  receita: Zap,
  material: Package,
  servico: FileText,
  telecom: Phone,
  aluguel: Building2,
  locacao: HardHat,
  imposto: Scale,
  pessoal: CreditCard,
  tarifa: Landmark,
  outros: Receipt,
};

/** Entrada ou saída: seta e texto, sem cor (decisão do protótipo). */
export function SetaDoTipo({ tipo, tamanho = 12 }: { tipo: LancamentoResumo["tipo"]; tamanho?: number }) {
  const Icone = tipo === "saida" ? ArrowUpRight : ArrowDownLeft;
  return <Icone size={tamanho} aria-hidden="true" />;
}

export const rotuloDoTipo = (tipo: LancamentoResumo["tipo"]): string => (tipo === "saida" ? "Saída" : "Entrada");

/**
 * O DatePicker só repassa a data digitada quando ela vale (completa, dentro do
 * mínimo e do máximo); senão mostra o erro e o valor do formulário fica no último
 * dia válido, que um formulário com `noValidate` mandaria. Antes de enviar: se o
 * texto do campo de data difere do valor guardado, o envio para e o campo mostra o
 * erro e ganha o foco. Vazio fica com a validação do formulário.
 */
export function dataDigitadaInvalida(formulario: HTMLFormElement, valor: string): boolean {
  const campo = formulario.querySelector<HTMLInputElement>(".ui-date-input-wrap input");
  if (!campo || campo.value.trim() === "") return false;
  const guardado = valor ? valor.split("-").reverse().join("/") : "";
  if (campo.value === guardado) return false;
  campo.reportValidity();
  campo.focus();
  return true;
}
