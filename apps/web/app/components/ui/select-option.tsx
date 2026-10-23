import type { ReactElement } from "react";
import { TagIcon } from "lucide-react";

export type SelectOption = { value: string; label: string; icon?: ReactElement; description?: string; disabled?: boolean };

export function OptionIcon({ icon }: { icon?: ReactElement }) {
  return <span className="ui-option-icon" aria-hidden="true">{icon ?? <TagIcon />}</span>;
}

export function OptionLabel({ option, description = false }: { option: Pick<SelectOption, "label" | "icon" | "description">; description?: boolean }) {
  return <span className="ui-option-label"><OptionIcon icon={option.icon} /><span>{option.label}{description && option.description && <small>{option.description}</small>}</span></span>;
}
