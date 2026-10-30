"use client";

// shadcn/ui, new-york-v4 (MIT). Estilos adaptados aos tokens e ao CSS da Plugga.
// https://ui.shadcn.com/r/styles/new-york-v4/popover.json
import type { ComponentProps } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className = "", align = "start", sideOffset = 6, container, ...props }: ComponentProps<typeof PopoverPrimitive.Content> & { container?: HTMLElement | null }) {
  return <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content data-slot="popover-content" align={align} sideOffset={sideOffset} collisionPadding={8}
      className={`ui-popover-content ${className}`} {...props} />
  </PopoverPrimitive.Portal>;
}
