"use client";

import type { ReactNode } from "react";
import { Modal } from "../modal";
import { Button } from "./button";

export function Dialog({ title, description, onClose, size = "media", children, footer }: {
  title: string; description?: string; onClose: () => void; size?: "estreita" | "media" | "larga"; children: ReactNode; footer?: ReactNode;
}) {
  return <Modal rotulo={title} aoFechar={onClose} largura={size}>
    <header className="ui-dialog-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      <Button variant="ghost" size="sm" aria-label="Fechar diálogo" onClick={onClose}>×</Button>
    </header>
    <div className="ui-dialog-body">{children}</div>
    {footer && <footer className="ui-dialog-footer">{footer}</footer>}
  </Modal>;
}
