import { ArchiveIcon, Building2Icon, ClockIcon, FilePenLineIcon, GaugeIcon, HandshakeIcon, SendIcon, SunIcon } from "lucide-react";
import type { SelectOption } from "../../components/ui";

export const DISTRIBUTORS: SelectOption[] = [
  { value: "norte", label: "Distribuidora Norte", description: "Exemplo · região Norte", icon: <Building2Icon /> },
  { value: "sul", label: "Distribuidora Sul", description: "Exemplo · região Sul", icon: <Building2Icon /> },
  { value: "centro", label: "Distribuidora Centro", description: "Exemplo · região Centro-Oeste", icon: <Building2Icon /> },
  { value: "leste", label: "Distribuidora Leste", description: "Indisponível", disabled: true, icon: <Building2Icon /> },
];
export const SERVICES: SelectOption[] = [
  { value: "gestao", label: "Gestão de energia", icon: <GaugeIcon /> },
  { value: "acl", label: "Mercado livre", icon: <HandshakeIcon /> },
  { value: "gd", label: "Geração distribuída", icon: <SunIcon /> },
];
export const STAGES: SelectOption[] = [
  { value: "analise", label: "Em análise", icon: <ClockIcon /> },
  { value: "proposta", label: "Proposta enviada", icon: <SendIcon /> },
  { value: "contrato", label: "Em contratação", icon: <FilePenLineIcon /> },
  { value: "arquivada", label: "Arquivada (indisponível)", disabled: true, icon: <ArchiveIcon /> },
];
