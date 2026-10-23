"use client";

import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Modal } from "../modal";
import { Button } from "./button";
import { IconX } from "./icons";
import { Heading } from "./heading";

export function Dialog({ title, description, icon, onClose, size = "media", children, footer, cancelAutoFocus = false }: {
  title: string; description?: string; icon?: ReactElement; onClose: () => void; size?: "estreita" | "media" | "larga"; children: ReactNode; footer?: ReactNode; cancelAutoFocus?: boolean;
}) {
  const footerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (cancelAutoFocus) footerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [cancelAutoFocus]);
  return <Modal rotulo={title} aoFechar={onClose} largura={size} className="ui-dialog">
    <header className="ui-dialog-header"><div><Heading icon={icon}>{title}</Heading>{description && <p>{description}</p>}</div>
      <Button variant="secondary" size="sm" icon={<IconX />} iconOnly aria-label="Fechar diálogo" onClick={onClose} />
    </header>
    <div className="ui-dialog-body">{children}</div>
    <footer ref={footerRef} className="ui-dialog-footer"><Button icon={<IconX />} variant="secondary" onClick={onClose}>Cancelar</Button>{footer && <div className="ui-dialog-actions">{footer}</div>}</footer>
  </Modal>;
}
