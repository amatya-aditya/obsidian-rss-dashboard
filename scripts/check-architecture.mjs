import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const baselinePath = path.join(scriptDirectory, "architecture-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const baseArgumentIndex = process.argv.indexOf("--base");
const baseReference =
  baseArgumentIndex >= 0 ? process.argv[baseArgumentIndex + 1] : undefined;

if (baseArgumentIndex >= 0 && !baseReference) {
  console.error("Architecture check: --base requires a Git reference.");
  process.exit(2);
}

function toRepositoryPath(filePath) {
  return path.relative(repositoryRoot, filePath).replaceAll("\\", "/");
}

function collectTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

const productionFiles = [
  path.join(repositoryRoot, "main.ts"),
  ...collectTypeScriptFiles(path.join(repositoryRoot, "src")),
];
const productionPaths = productionFiles.map(toRepositoryPath).sort();

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function getFunctionName(node, sourceFile) {
  if (node.name?.getText) return node.name.getText(sourceFile);
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isVariableDeclaration(node.parent)) {
    return node.parent.name.getText(sourceFile);
  }
  if (ts.isPropertyAssignment(node.parent)) {
    return node.parent.name.getText(sourceFile);
  }
  return "<anonymous>";
}

function measureComplexity(functionNode) {
  let complexity = 1;

  function visit(node) {
    if (node !== functionNode && isFunctionNode(node)) return;

    if (
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCatchClause(node) ||
      ts.isCaseClause(node)
    ) {
      complexity += 1;
    }

    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    ) {
      complexity += 1;
    }

    ts.forEachChild(node, visit);
  }

  if (functionNode.body) visit(functionNode.body);
  return complexity;
}

function isTypeOnlyImport(importDeclaration) {
  const importClause = importDeclaration.importClause;
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;

  const bindings = importClause.namedBindings;
  return (
    bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function analyzeFile(repositoryPath, sourceText) {
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = [];
  const nameCounts = new Map();
  const imports = [];

  function visit(node) {
    if (isFunctionNode(node) && node.body) {
      const start =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      const end = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
      const name = getFunctionName(node, sourceFile);
      const occurrence = (nameCounts.get(name) ?? 0) + 1;
      nameCounts.set(name, occurrence);
      functions.push({
        key: repositoryPath + "::" + name + "#" + occurrence,
        file: repositoryPath,
        name,
        start,
        lines: end - start + 1,
        complexity: measureComplexity(node),
        parameters: node.parameters?.length ?? 0,
      });
    }
    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      imports.push({
        specifier: statement.moduleSpecifier.text,
        typeOnly: isTypeOnlyImport(statement),
      });
    }
  }

  visit(sourceFile);
  return {
    file: repositoryPath,
    lines: sourceText.split(/\r?\n/).length,
    functions,
    imports,
  };
}

function resolveImport(fromPath, specifier, availablePaths) {
  const basePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPath), specifier),
  );
  const candidates = [
    basePath,
    basePath + ".ts",
    basePath.replace(/\.js$/, ".ts"),
    path.posix.join(basePath, "index.ts"),
  ];
  return candidates.find((candidate) => availablePaths.has(candidate));
}

function findRuntimeCycles(files, runtimeGraph) {
  let nextId = 0;
  const ids = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  function connect(file) {
    ids.set(file, nextId);
    lowLinks.set(file, nextId);
    nextId += 1;
    stack.push(file);
    onStack.add(file);

    for (const dependency of runtimeGraph.get(file) ?? []) {
      if (!ids.has(dependency)) {
        connect(dependency);
        lowLinks.set(
          file,
          Math.min(lowLinks.get(file), lowLinks.get(dependency)),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), ids.get(dependency)));
      }
    }

    if (lowLinks.get(file) !== ids.get(file)) return;

    const members = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      members.push(member);
    } while (member !== file);

    if (members.length > 1) cycles.push(members.sort());
  }

  for (const file of files) {
    if (!ids.has(file)) connect(file);
  }
  return cycles.sort((left, right) => left.join().localeCompare(right.join()));
}

function buildSnapshot(readSource) {
  const files = [];
  for (const repositoryPath of productionPaths) {
    const sourceText = readSource(repositoryPath);
    if (sourceText !== null)
      files.push(analyzeFile(repositoryPath, sourceText));
  }

  const availablePaths = new Set(files.map((file) => file.file));
  const allGraph = new Map();
  const runtimeGraph = new Map();

  for (const file of files) {
    const allDependencies = [];
    const runtimeDependencies = [];
    for (const importEntry of file.imports) {
      const target = resolveImport(
        file.file,
        importEntry.specifier,
        availablePaths,
      );
      if (!target) continue;
      allDependencies.push(target);
      if (!importEntry.typeOnly) runtimeDependencies.push(target);
    }
    allGraph.set(file.file, [...new Set(allDependencies)]);
    runtimeGraph.set(file.file, [...new Set(runtimeDependencies)]);
  }

  const functions = files.flatMap((file) => file.functions);
  const mainImporters = files
    .filter((file) => (allGraph.get(file.file) ?? []).includes("main.ts"))
    .map((file) => file.file)
    .sort();

  return {
    files,
    functions,
    allGraph,
    runtimeCycles: findRuntimeCycles(
      files.map((file) => file.file),
      runtimeGraph,
    ),
    mainImporters,
  };
}

const currentSnapshot = buildSnapshot((repositoryPath) =>
  fs.readFileSync(path.join(repositoryRoot, repositoryPath), "utf8"),
);

function printOutliers(label, entries, valueName, threshold) {
  const sorted = [...entries].sort(
    (left, right) => right[valueName] - left[valueName],
  );
  console.log(
    "WARN " +
      label +
      ": " +
      sorted.length +
      " exceed " +
      threshold +
      " (" +
      ((sorted.length / currentSnapshot.functions.length) * 100).toFixed(2) +
      "% of functions)",
  );
  for (const entry of sorted.slice(0, 10)) {
    console.log(
      "  " +
        entry.file +
        ":" +
        entry.start +
        " " +
        entry.name +
        " (" +
        entry[valueName] +
        ")",
    );
  }
  if (sorted.length > 10)
    console.log("  ... " + (sorted.length - 10) + " more");
}

const thresholds = baseline.thresholds;
const largeFiles = currentSnapshot.files.filter(
  (file) => file.lines > thresholds.fileLines,
);
console.log("Architecture observations");
console.log(
  "WARN file size: " +
    largeFiles.length +
    " of " +
    currentSnapshot.files.length +
    " production files exceed " +
    thresholds.fileLines +
    " physical lines (" +
    ((largeFiles.length / currentSnapshot.files.length) * 100).toFixed(2) +
    "%)",
);
for (const file of [...largeFiles].sort((a, b) => b.lines - a.lines)) {
  console.log("  " + file.file + " (" + file.lines + ")");
}

printOutliers(
  "function size",
  currentSnapshot.functions.filter(
    (entry) => entry.lines > thresholds.functionLines,
  ),
  "lines",
  thresholds.functionLines,
);
printOutliers(
  "branch complexity",
  currentSnapshot.functions.filter(
    (entry) => entry.complexity > thresholds.complexity,
  ),
  "complexity",
  thresholds.complexity,
);
printOutliers(
  "parameter count",
  currentSnapshot.functions.filter(
    (entry) => entry.parameters > thresholds.parameters,
  ),
  "parameters",
  thresholds.parameters,
);

const errors = [];
const mainFile = currentSnapshot.files.find((file) => file.file === "main.ts");
if (!mainFile) {
  errors.push("main.ts is missing from the production source set.");
} else if (mainFile.lines > baseline.ratchets.mainTsMaxLines) {
  errors.push(
    "main.ts grew to " +
      mainFile.lines +
      " lines; ratchet maximum is " +
      baseline.ratchets.mainTsMaxLines +
      ".",
  );
} else if (mainFile.lines < baseline.ratchets.mainTsMaxLines) {
  errors.push(
    "main.ts shrank to " +
      mainFile.lines +
      " lines; lower the ratchet from " +
      baseline.ratchets.mainTsMaxLines +
      " in the same change.",
  );
}

const allowedMainImporters = new Set(
  baseline.ratchets.allowedMainImporters ?? [],
);
for (const importer of currentSnapshot.mainImporters) {
  if (!allowedMainImporters.has(importer)) {
    errors.push("New production importer of main.ts: " + importer);
  }
}
for (const importer of allowedMainImporters) {
  if (!currentSnapshot.mainImporters.includes(importer)) {
    errors.push(
      "Remove stale main.ts importer allowance after decoupling: " + importer,
    );
  }
}

const forbiddenServiceTargets = [
  "main.ts",
  "src/views/",
  "src/components/",
  "src/modals/",
  "src/settings/",
];
for (const [file, dependencies] of currentSnapshot.allGraph) {
  if (!file.startsWith("src/services/")) continue;
  for (const dependency of dependencies) {
    if (
      forbiddenServiceTargets.some(
        (target) =>
          dependency === target ||
          (target.endsWith("/") && dependency.startsWith(target)),
      )
    ) {
      errors.push(
        "Service dependency points upward: " + file + " -> " + dependency,
      );
    }
  }
}

const allowedCycleSets = (
  baseline.ratchets.allowedRuntimeCycleNodeSets ?? []
).map((cycle) => new Set(cycle));
for (const cycle of currentSnapshot.runtimeCycles) {
  const coveredByBaseline = allowedCycleSets.some((allowed) =>
    cycle.every((member) => allowed.has(member)),
  );
  if (!coveredByBaseline) {
    errors.push("New runtime cycle: " + cycle.join(" -> "));
  }
}
for (const allowedCycle of baseline.ratchets.allowedRuntimeCycleNodeSets ??
  []) {
  const allowanceStillNeeded = currentSnapshot.runtimeCycles.some(
    (cycle) =>
      cycle.length === allowedCycle.length &&
      cycle.every((member) => allowedCycle.includes(member)),
  );
  if (!allowanceStillNeeded) {
    errors.push(
      "Remove or narrow stale runtime-cycle allowance: " +
        allowedCycle.join(" -> "),
    );
  }
}

function readGitSource(reference, repositoryPath) {
  try {
    return execFileSync("git", ["show", reference + ":" + repositoryPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function printArchitectureDiff(reference) {
  const baseSnapshot = buildSnapshot((repositoryPath) =>
    readGitSource(reference, repositoryPath),
  );
  if (baseSnapshot.files.length === 0) {
    errors.push(
      "Cannot read production sources from Git reference " + reference + ".",
    );
    return;
  }

  const baseFiles = new Map(
    baseSnapshot.files.map((file) => [file.file, file]),
  );
  const changedFiles = currentSnapshot.files
    .map((file) => ({
      file: file.file,
      delta: file.lines - (baseFiles.get(file.file)?.lines ?? 0),
    }))
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const baseFunctions = new Map(
    baseSnapshot.functions.map((entry) => [entry.key, entry]),
  );
  const crossingDefinitions = [
    ["function lines", "lines", thresholds.functionLines],
    ["branch complexity", "complexity", thresholds.complexity],
    ["parameters", "parameters", thresholds.parameters],
  ];
  const crossings = [];
  for (const [label, property, threshold] of crossingDefinitions) {
    for (const entry of currentSnapshot.functions) {
      const previous = baseFunctions.get(entry.key)?.[property] ?? 0;
      if (entry[property] > threshold && previous <= threshold) {
        crossings.push(
          label +
            ": " +
            entry.file +
            ":" +
            entry.start +
            " " +
            entry.name +
            " (" +
            previous +
            " -> " +
            entry[property] +
            ")",
        );
      }
    }
  }

  const baseImporterSet = new Set(baseSnapshot.mainImporters);
  const newMainImporters = currentSnapshot.mainImporters.filter(
    (file) => !baseImporterSet.has(file),
  );
  const newCycles = currentSnapshot.runtimeCycles.filter(
    (cycle) =>
      !baseSnapshot.runtimeCycles.some((oldCycle) =>
        cycle.every((member) => oldCycle.includes(member)),
      ),
  );

  console.log("");
  console.log("Architecture diff against " + reference);
  const mainDelta =
    (currentSnapshot.files.find((file) => file.file === "main.ts")?.lines ??
      0) - (baseFiles.get("main.ts")?.lines ?? 0);
  console.log(
    "  main.ts LOC delta: " + (mainDelta >= 0 ? "+" : "") + mainDelta,
  );
  console.log("  changed production files: " + changedFiles.length);
  for (const entry of changedFiles.slice(0, 10)) {
    console.log(
      "    " + entry.file + ": " + (entry.delta >= 0 ? "+" : "") + entry.delta,
    );
  }
  if (changedFiles.length > 10) {
    console.log("    ... " + (changedFiles.length - 10) + " more");
  }
  console.log("  new threshold crossings: " + crossings.length);
  for (const crossing of crossings.slice(0, 10)) console.log("    " + crossing);
  if (crossings.length > 10)
    console.log("    ... " + (crossings.length - 10) + " more");
  console.log(
    "  new main.ts importers: " +
      (newMainImporters.length ? newMainImporters.join(", ") : "none"),
  );
  console.log(
    "  new runtime cycles: " +
      (newCycles.length
        ? newCycles.map((cycle) => cycle.join(" -> ")).join("; ")
        : "none"),
  );
}

if (baseReference) printArchitectureDiff(baseReference);

console.log("");
console.log("Architecture guardrails");
if (errors.length === 0) {
  console.log(
    "PASS main.ts ratchet, main.ts importer ratchet, service dependency direction, and runtime-cycle ratchet.",
  );
} else {
  for (const error of errors) console.error("ERROR " + error);
  process.exitCode = 1;
}
