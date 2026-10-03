import { describe, expect, it } from "vitest";
import { TEMPLATE_VARIABLES } from "../../../../src/services/article-template/template-variables";

describe("TEMPLATE_VARIABLES", () => {
  it("matches each variable's own {{name}} placeholder, every time it appears", () => {
    for (const [name, variable] of Object.entries(TEMPLATE_VARIABLES)) {
      expect(`{{${name}}} {{${name}}}`.replace(variable.placeholder, "V")).toBe(
        "V V",
      );
    }
  });

  it("doesn't match a {{date:FORMAT}} placeholder", () => {
    expect("{{date:YYYY}}".replace(TEMPLATE_VARIABLES.date.placeholder, "V")).toBe(
      "{{date:YYYY}}",
    );
  });
});
