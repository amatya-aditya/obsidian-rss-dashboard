const ALLOWLIST_PREFIXES = ["test_files/"];

const RULES = [
  {
    rule: "abstract-input-suggest",
    minAppVersion: "1.4.10",
    pattern: /\bAbstractInputSuggest\b/,
    message:
      "AbstractInputSuggest was introduced in Obsidian 1.4.10; use a 1.1-compatible suggester implementation.",
  },
  {
    rule: "app-local-storage",
    minAppVersion: "1.8.7",
    pattern: /\bthis\.app\.(?:loadLocalStorage|saveLocalStorage)\s*\(/,
    message:
      "App local-storage methods were introduced in Obsidian 1.8.7; route this through a guarded compatibility adapter.",
  },
  {
    rule: "unsupported-icon",
    minAppVersion: "1.1.0",
    pattern: /["'](?:arrow-up-down|panel-left-open|panel-left-close)["']/,
    message:
      "This icon is not bundled by Obsidian 1.1; use a compatible icon name.",
  },
];

function isAllowlisted(filePath) {
  return ALLOWLIST_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

export function findObsidian110CompatibilityViolations(
  source,
  filePath = "unknown",
) {
  if (isAllowlisted(filePath)) {
    return [];
  }

  const violations = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }

    for (const finding of RULES) {
      if (finding.pattern.test(line)) {
        violations.push({
          filePath,
          line: index + 1,
          text: trimmed,
          ...finding,
        });
      }
    }
  }

  return violations;
}
