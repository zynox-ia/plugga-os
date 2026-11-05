import { Trigger } from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

import estilos from "../pipelines/tela-pipelines.module.css";
import type { SelectOption } from "../ui/select-option";
import { Select, SelectContent, SelectItem, SelectValue } from "../ui/shadcn/select";
import styles from "./filtro-de-clientes.module.css";

export function FiltroDeClientes({ label, options, value, onChange }: { label: string; options: readonly SelectOption[]; value: string; onChange: (value: string) => void }) {
  const selecionada = options.find((opcao) => opcao.value === value);

  return <Select value={value} onValueChange={onChange}>
    <Trigger className={`${estilos.seletorTrigger} ${styles.trigger}`} aria-label={label}>
      <span className={styles.icone} aria-hidden="true">{selecionada?.icon}</span>
      <span className={`${estilos.seletorLabel} ${styles.label}`}><SelectValue /></span>
      <ChevronDown size={15} className={estilos.seletorChevron} aria-hidden="true" />
    </Trigger>
    <SelectContent className={`${estilos.popoverFunis} ${styles.menu}`} align="end" aria-label={label}>
      {options.map((opcao) => <SelectItem key={opcao.value} value={opcao.value} disabled={opcao.disabled} textValue={opcao.label}
        className={`${estilos.popoverItem} ${opcao.value === value ? estilos.popoverItemAtivo : ""} ${styles.opcao}`}>
        {opcao.label}
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
