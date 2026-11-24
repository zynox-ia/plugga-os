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
