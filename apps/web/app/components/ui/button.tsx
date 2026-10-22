"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading = false, disabled, className = "", children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`button button--${variant === "danger" ? "perigo" : variant} ui-button ui-button--${size} ${className}`}>
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
