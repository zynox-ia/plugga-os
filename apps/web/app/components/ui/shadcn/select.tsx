"use client";

// shadcn/ui, new-york-v4 (MIT). Estilos adaptados aos tokens e ao CSS da Plugga.
// https://ui.shadcn.com/r/styles/new-york-v4/select.json
import type { ComponentProps } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className = "", children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={`ui-input ui-field-trigger ${className}`} {...props}>
    {children}<SelectPrimitive.Icon asChild><ChevronDownIcon size={16} aria-hidden="true" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

export function SelectContent({ className = "", children, position = "popper", align = "start", container, ...props }: ComponentProps<typeof SelectPrimitive.Content> & { container?: HTMLElement | null }) {
  return <SelectPrimitive.Portal container={container}>
    <SelectPrimitive.Content data-slot="select-content" className={`ui-select-content ${className}`}
      position={position} align={align} sideOffset={6} collisionPadding={8} {...props}>
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className="ui-select-viewport">{children}</SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}

export function SelectItem({ className = "", children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={`ui-select-item ${className}`} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="ui-select-indicator"><SelectPrimitive.ItemIndicator><CheckIcon size={16} aria-hidden="true" /></SelectPrimitive.ItemIndicator></span>
  </SelectPrimitive.Item>;
}

function SelectScrollUpButton(props: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return <SelectPrimitive.ScrollUpButton className="ui-select-scroll" {...props}><ChevronUpIcon size={16} aria-hidden="true" /></SelectPrimitive.ScrollUpButton>;
}

function SelectScrollDownButton(props: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return <SelectPrimitive.ScrollDownButton className="ui-select-scroll" {...props}><ChevronDownIcon size={16} aria-hidden="true" /></SelectPrimitive.ScrollDownButton>;
}
