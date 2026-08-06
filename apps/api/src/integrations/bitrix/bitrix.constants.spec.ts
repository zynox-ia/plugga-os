import { describe, expect, it } from "vitest";

import { assertReadOnlyMethod } from "./bitrix.constants";

describe("assertReadOnlyMethod", () => {
  it.each(["crm.item.list", "crm.item.get", "crm.item.fields"])(
    "allows the read method '%s'",
    (method) => {
      expect(() => assertReadOnlyMethod(method)).not.toThrow();
    },
  );

  it.each([
    "crm.item.add",
    "crm.item.update",
    "crm.item.delete",
    "crm.item.set",
    "crm.deal.add",
    "user.add",
    "crm.item.list.add",
    "crm.item.batch",
    "",
  ])("refuses the write-shaped method '%s'", (method) => {
    expect(() => assertReadOnlyMethod(method)).toThrow(/read-only/);
  });

  it.each([
    "crm.item.list ",
    "CRM.ITEM.LIST",
    "crm.item.list\n",
    "crm.item.update?x=crm.item.list",
  ])("refuses '%s' — the allowlist matches exact names only", (method) => {
    expect(() => assertReadOnlyMethod(method)).toThrow(/read-only/);
  });

  it("refuses read methods outside the migrator's declared surface", () => {
    // Read-shaped, but not a method this migrator is allowed to issue.
    expect(() => assertReadOnlyMethod("user.get")).toThrow(/read-only/);
    expect(() => assertReadOnlyMethod("crm.deal.list")).toThrow(/read-only/);
  });
});
