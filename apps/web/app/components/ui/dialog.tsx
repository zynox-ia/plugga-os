"use client";

import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Modal } from "../modal";
import { Button } from "./button";
import { IconX } from "./icons";

export function Dialog({
  title,
  description,
  icon,
  variant = "default",
  onClose,
  size = "media",
  children,
  footer,
  cancelAutoFocus = false,
  cancelText = "Cancelar",
  accessibleLabel,
}: {
  title: string;
  description?: string;
  icon?: ReactElement;
  variant?: "default" | "danger";
  onClose: () => void;
  size?: "estreita" | "media" | "larga";
  children: ReactNode;
  footer?: ReactNode;
  cancelAutoFocus?: boolean;
  cancelText?: string;
  accessibleLabel?: string;
}) {
  const footerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (cancelAutoFocus) footerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [cancelAutoFocus]);

  return (
    <Modal rotulo={accessibleLabel ?? title} aoFechar={onClose} largura={size} className="ui-dialog">
      <header className="ui-dialog-header">
        <div className="ui-dialog-header-content">
          {icon ? (
            <div
              className={`ui-dialog-header-icon ${variant === "danger" ? "ui-dialog-header-icon--danger" : ""}`}
              aria-hidden="true"
            >
              {icon}
            </div>
          ) : null}
          <div className="ui-dialog-header-text">
            <h2 className="ui-dialog-title">{title}</h2>
            {description ? <p className="ui-dialog-subtitle">{description}</p> : null}
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={<IconX />} iconOnly aria-label="Fechar diálogo" onClick={onClose} />
      </header>
      <div className="ui-dialog-body">{children}</div>
      <footer ref={footerRef} className="ui-dialog-footer">
        <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
        {footer && <div className="ui-dialog-actions">{footer}</div>}
      </footer>
    </Modal>
  );
}
