"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export function Tabs({ label, items }: { label: string; items: { id: string; label: string; content: ReactNode }[] }) {
  const id = useId();
  const [selected, setSelected] = useState(items[0]?.id);
  const list = useRef<HTMLDivElement>(null);
  const active = items.some((item) => item.id === selected) ? selected : items[0]?.id;
  return <div>
    <div ref={list} role="tablist" aria-label={label} className="ui-tabs-list" onKeyDown={(event) => {
      const current = items.findIndex((item) => item.id === active);
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % items.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else return;
      event.preventDefault(); setSelected(items[next]?.id);
      list.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>
      {items.map((item) => <button type="button" key={item.id} role="tab" id={`${id}-tab-${item.id}`}
        aria-controls={`${id}-panel-${item.id}`} aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1}
        className="ui-tab" onClick={() => setSelected(item.id)}>{item.label}</button>)}
    </div>
    {items.map((item) => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
      aria-labelledby={`${id}-tab-${item.id}`} hidden={active !== item.id} tabIndex={0} className="ui-tab-panel">{item.content}</div>)}
  </div>;
}
