"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";

export type MenuItem = { id: string; label: string; onSelect: () => void; checked?: boolean; disabled?: boolean; danger?: boolean };

export function DropdownMenu({ label, items, disabled = false }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const startAtEnd = useRef(false);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    buttons?.[startAtEnd.current ? buttons.length - 1 : 0]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="ui-popover-root" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} id={`${id}-trigger`} disabled={disabled}
      className="button button--secondary ui-button ui-button--md ui-menu-trigger"
      aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
      onClick={() => { startAtEnd.current = false; setOpen(!open); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); startAtEnd.current = event.key === "ArrowUp"; setOpen(true);
        }
      }}>{label}<span aria-hidden="true">⌄</span></button>
    {expanded && <div id={id} ref={menu} role="menu" aria-labelledby={`${id}-trigger`} className="ui-popover ui-menu"
      onKeyDown={(event) => {
        const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next = current;
        if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
        else if (event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        else if (event.key === "Tab") { close(); return; }
        else return;
        event.preventDefault(); buttons[next]?.focus();
      }}>
      {items.map((item) => <button key={item.id} type="button" tabIndex={-1} disabled={item.disabled}
        role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.checked}
        className={`ui-option ${item.danger ? "ui-option--danger" : ""}`}
        onClick={() => { item.onSelect(); if (item.checked === undefined) close(); }}>
        <span>{item.label}</span>{item.checked !== undefined && <span className="ui-menu-check" aria-hidden="true">{item.checked && <CheckIcon size={14} />}</span>}
      </button>)}
    </div>}
  </div>;
}
