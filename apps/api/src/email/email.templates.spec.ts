import { describe, expect, it } from "vitest";

import type { TransactionalEmail } from "./email.port";
import { renderTemplate } from "./email.templates";

const link = "http://localhost:3000/auth/accept-invite?token=opaque-token-value";

function email(overrides: Partial<TransactionalEmail> = {}): TransactionalEmail {
  return {
    to: "person@example.com",
    template: "invite",
    variables: { name: "Ana", link, expiresInMinutes: 4_320 },
    ...overrides,
  };
}

describe("renderTemplate", () => {
  it("renders a PT-BR invite with subject, link and expiry in both parts", () => {
    const rendered = renderTemplate(email());

    expect(rendered.subject).toContain("Convite");
    expect(rendered.html).toContain(link);
    expect(rendered.html).toContain("3 dias");
    expect(rendered.text).toContain(link);
    expect(rendered.text).toContain("3 dias");
    expect(rendered.html).toContain("Ana");
  });

  it("renders a PT-BR reset with a distinct subject and 1-hour expiry", () => {
    const rendered = renderTemplate(
      email({ template: "reset", variables: { name: "Ana", link, expiresInMinutes: 60 } }),
    );

    expect(rendered.subject).toContain("Redefinição");
    expect(rendered.subject).not.toContain("Convite");
    expect(rendered.html).toContain("1 hora");
    expect(rendered.text).toContain("1 hora");
  });

  it("escapes HTML in the recipient name to prevent injection", () => {
    const rendered = renderTemplate(
      email({ variables: { name: "<script>alert(1)</script>", link, expiresInMinutes: 60 } }),
    );

    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("falls back to a generic greeting when no name is provided", () => {
    const rendered = renderTemplate(
      email({ variables: { link, expiresInMinutes: 60 } }),
    );

    expect(rendered.html).toContain("olá");
  });
});
