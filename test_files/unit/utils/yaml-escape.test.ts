import { describe, expect, it } from "vitest";
import { escapeYamlDoubleQuoted } from "../../../src/utils/yaml-escape";

describe("escapeYamlDoubleQuoted", () => {
  it("escapes backslashes and double quotes", () => {
    expect(escapeYamlDoubleQuoted('a\\b"c')).toBe('a\\\\b\\"c');
  });

  it("collapses every line-break style to an escaped \\n", () => {
    expect(escapeYamlDoubleQuoted("a\r\nb\rc\nd")).toBe("a\\nb\\nc\\nd");
  });

  it("escapes C0 control characters and DEL as two-digit hex", () => {
    expect(escapeYamlDoubleQuoted("a\u001Bb")).toBe("a\\x1Bb");
    expect(escapeYamlDoubleQuoted("\u0000")).toBe("\\x00");
    expect(escapeYamlDoubleQuoted("\u007F")).toBe("\\x7F");
    expect(escapeYamlDoubleQuoted("\u000B\u000C\u000E\u001F")).toBe(
      "\\x0B\\x0C\\x0E\\x1F",
    );
  });

  it("escapes next line, line separator, and paragraph separator by name", () => {
    expect(escapeYamlDoubleQuoted("a\u0085b")).toBe("a\\Nb");
    expect(escapeYamlDoubleQuoted("\u2028")).toBe("\\L");
    expect(escapeYamlDoubleQuoted("\u2029")).toBe("\\P");
  });

  it("escapes the byte-order mark and noncharacters as four-digit hex", () => {
    expect(escapeYamlDoubleQuoted("\uFEFF")).toBe("\\uFEFF");
    expect(escapeYamlDoubleQuoted("\uFFFE")).toBe("\\uFFFE");
    expect(escapeYamlDoubleQuoted("\uFFFF")).toBe("\\uFFFF");
  });

  it("escapes unpaired surrogates but keeps valid pairs", () => {
    expect(escapeYamlDoubleQuoted("\uD83D")).toBe("\\uD83D");
    expect(escapeYamlDoubleQuoted("a\uDE00b")).toBe("a\\uDE00b");
    expect(escapeYamlDoubleQuoted("\uDE00\uD83D")).toBe("\\uDE00\\uD83D");
    expect(escapeYamlDoubleQuoted("\uD83D\uDE00")).toBe("\uD83D\uDE00");
  });

  it("leaves tabs and other printable text unchanged", () => {
    expect(escapeYamlDoubleQuoted("a\tb")).toBe("a\tb");
    expect(escapeYamlDoubleQuoted("caf\u00E9")).toBe("caf\u00E9");
  });

  it("does not re-escape the backslash of a control-character escape", () => {
    expect(escapeYamlDoubleQuoted("\\\u001B")).toBe("\\\\\\x1B");
  });
});
