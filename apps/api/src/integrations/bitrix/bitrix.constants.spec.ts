import { describe, expect, it } from "vitest";

import { assertReadOnlyMethod } from "./bitrix.constants";

describe("assertReadOnlyMethod", () => {
  it.each([
    "crm.item.list",
    "crm.item.get",
    "crm.item.fields",
    "crm.deal.list",
    "user.get",
  ])("allows the read method '%s'", (method) => {
    expect(() => assertReadOnlyMethod(method)).not.toThrow();
  });

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

  it("is not fooled by a read word that is not the method suffix", () => {
    // 'list' appears in the name but the call is a mutation.
    expect(() => assertReadOnlyMethod("crm.list.item.update")).toThrow(/read-only/);
  });
});
