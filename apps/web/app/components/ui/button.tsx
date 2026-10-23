"use client";

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon: ReactElement;
} & (
  | { children: ReactNode; iconOnly?: false }
  | { iconOnly: true; children?: never; "aria-label": string }
);

export function Button({ variant = "primary", size = "md", loading = false, icon, iconOnly = false, disabled, className = "", children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`button button--${variant === "danger" ? "perigo" : variant} ui-button ui-button--${size} ${iconOnly ? "ui-button--icon-only" : ""} ${className}`}>
      <span className="ui-button-icon" aria-hidden="true">{loading ? <span className="ui-spinner" /> : icon}</span>
      {!iconOnly && <span className="ui-button-label">{children}</span>}
    </button>
  );
}
