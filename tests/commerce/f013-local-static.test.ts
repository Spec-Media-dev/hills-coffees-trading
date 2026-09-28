import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repo = process.cwd();
const source = (path: string) => readFileSync(resolve(repo, path), "utf8");
function executableSources(folder: string): string[] {
  return readdirSync(resolve(repo, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return executableSources(path);
    return /\.(?:tsx?|mts|mjs|jsx?|cjs)$/.test(entry.name) ? [path] : [];
  });
}
const sources = ["scripts", "tests", "lib", "src", "components", "tools"].filter((folder) => existsSync(resolve(repo, folder))).flatMap(executableSources);
const slash = (path: string) => path.replaceAll("\\", "/");
const safetyTests = new Set(["tests/commerce/f013-local-static.test.ts", "tests/commerce/f013-local-target.test.ts"]);

function tree(path: string, contents: string): ts.SourceFile {
  return ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, /\.[cm]?jsx?$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
}
function constantString(node: ts.Node, constants: Map<string, string> = new Map()): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text);
  if (ts.isParenthesizedExpression(node)) return constantString(node.expression, constants);
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const value = constantString(span.expression, constants);
      if (value === undefined) return undefined;
      result += value + span.literal.text;
    }
    return result;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = constantString(node.left, constants);
    const right = constantString(node.right, constants);
    if (left !== undefined && right !== undefined) return left + right;
  }
  return undefined;
}
function stringConstants(ast: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  for (let pass = 0; pass < 3; pass++) {
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const value = constantString(node.initializer, constants);
        if (value !== undefined) constants.set(node.name.text, value);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return constants;
}
function environmentFileViolations(path: string, contents: string): string[] {
  const ast = tree(path, contents);
  const constants = stringConstants(ast);
  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    const value = constantString(node, constants);
    if (value !== undefined && (/\.env\.local/i.test(value) || /--env-file/i.test(value) || /@next\/env/i.test(value) || /^dotenv(?:\/|$)/i.test(value))) {
      violations.push(value);
    }
    if (ts.isIdentifier(node) && node.text === "dotenv") violations.push("dotenv identifier");
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast).replace(/\s/g, "");
      if (/(?:^|\.)loadEnvFile$|(?:^|\.)parseEnv$/.test(callee)) violations.push(callee);
      if (/(?:readFileSync|readFile|createReadStream|loadEnvFile)$/.test(callee) && node.arguments[0]) {
        const argument = node.arguments[0];
        if (constantString(argument, constants) === undefined && /env|dotenv/i.test(argument.getText(ast))) violations.push("dynamic env file path");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return violations;
}
function inheritedEnvironmentViolations(path: string, contents: string): string[] {
  const ast = tree(path, contents);
  const violations: string[] = [];
  const aliases = new Set<string>();
  const isWholeEnv = (node: ts.Node) => node.getText(ast).replace(/\s/g, "") === "process.env";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isWholeEnv(node.initializer)) aliases.add(node.name.text);
    if ((ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) && isWholeEnv(node.expression)) violations.push("process.env spread");
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "env" && (isWholeEnv(node.initializer) || (ts.isIdentifier(node.initializer) && aliases.has(node.initializer.text)))) violations.push("direct child env");
    if (ts.isCallExpression(node) && node.expression.getText(ast).replace(/\s/g, "") === "Object.assign" && node.arguments.some(isWholeEnv)) violations.push("Object.assign process.env");
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return violations;
}
function linkedLiterals(path: string, contents: string): string[] {
  const ast = tree(path, contents);
  const constants = stringConstants(ast);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteralLike(node) || ts.isBinaryExpression(node) || ts.isTemplateExpression(node) || ts.isIdentifier(node)) && constantString(node, constants)?.startsWith("--linked")) found.push(node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

function childEnvironmentViolations(path: string, contents: string): string[] {
  const ast = tree(path, contents);
  const violations: string[] = [];
  const optionObjects = new Map<string, ts.ObjectLiteralExpression>();
  const approvedEnvs = new Set<string>();
  const childCalls = new Set<string>();
  const childNamespaces = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) optionObjects.set(node.name.text, node.initializer);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && /^(?:f013LocalChildEnv|productionChildEnv|sanitizedF013Environment)\s*\(/.test(node.initializer.getText(ast))) approvedEnvs.add(node.name.text);
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "require" &&
        node.initializer.arguments[0] && ts.isStringLiteral(node.initializer.arguments[0]) && /^(?:node:)?child_process$/.test(node.initializer.arguments[0].text)) {
      if (ts.isIdentifier(node.name)) childNamespaces.add(node.name.text);
      if (ts.isObjectBindingPattern(node.name)) for (const element of node.name.elements) if (ts.isIdentifier(element.name)) childCalls.add(element.name.text);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^(?:node:)?child_process$/.test(node.moduleSpecifier.text)) {
      const clause = node.importClause?.namedBindings;
      if (clause && ts.isNamedImports(clause)) for (const element of clause.elements) childCalls.add(element.name.text);
      if (clause && ts.isNamespaceImport(clause)) childNamespaces.add(clause.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(ast);
  const allowlisted = (callee: string, first: ts.Expression | undefined, call: ts.CallExpression) => {
    const command = first && constantString(first, stringConstants(ast));
    const file = slash(path);
    const chromeFiles = new Set([
      "tests/browser/cdp-harness.mjs", "tests/design/phase6-8-closure.browser.mjs",
      "tests/design/ui-foundation.browser.mjs", "tests/design/uif-fg.browser.mjs",
      "tests/design/uif-h-closure.browser.mjs", "tests/public/leakage-surfaces.production.mjs",
    ]);
    const gitFiles = new Set([
      "tests/design/uif-g.test.tsx", "tests/design/uif-f.test.tsx",
      "tests/orders/checkout.test.ts", "tests/orders/audits.test.ts", "tests/orders/error-mapping.test.ts",
      "tests/orders/expiry.test.ts", "tests/orders/no-title-transfer.test.ts",
      "tests/commerce/migrations/m3-rls.test.ts", "tests/commerce/migrations/m4a-cart-rpcs.test.ts",
      "tests/public/cache-identity-independence.test.ts", "tests/public/client-island-audit.test.ts",
    ]);
    const gitArg = call.arguments[1] && ts.isArrayLiteralExpression(call.arguments[1]) && call.arguments[1].elements[0] ? constantString(call.arguments[1].elements[0], stringConstants(ast)) : undefined;
    // Reviewed exceptions: read-only Git inspection, browser launch, and an isolated scratch-DB test.
    return (gitFiles.has(file) && ((["execFileSync", "execFile", "spawnSync", "spawn"].includes(callee) && command === "git" && ["ls-files", "grep", "diff", "status", "show"].includes(gitArg ?? "")) ||
      (["execSync", "exec"].includes(callee) && command !== undefined && /^git\s+(?:ls-files|grep|diff|status|show)\b/.test(command)))) ||
      (chromeFiles.has(file) && callee === "spawn" && first?.getText(ast) === "chromePath") ||
      (file === "tests/database/inventory-variance-scratch.test.ts" && command === "docker" && ["execFileSync", "spawn"].includes(callee)) ||
      (file === "tests/database/inventory-variance-scratch.test.ts" && callee === "execFileSync" && first?.getText(ast) === "process.execPath" && /setTimeout\(\(\) => \{\}, 1000\)/.test(call.getText(ast)));
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(ast);
      const callee = expression.split(".").at(-1)!;
      if (!/^(?:execFileSync|execFile|execSync|spawnSync|spawn|fork|exec)$/.test(callee) || !(childCalls.has(expression) || [...childNamespaces].some((name) => expression === `${name}.${callee}`))) {
        ts.forEachChild(node, visit);
        return;
      }
      if (!allowlisted(callee, node.arguments[0], node)) {
        const rawOptions = node.arguments.at(-1);
        const options = rawOptions && ts.isIdentifier(rawOptions) ? optionObjects.get(rawOptions.text) : rawOptions;
        const envProperty = options && ts.isObjectLiteralExpression(options) ? options.properties.find((property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name.getText(ast) === "env") : undefined;
        const envExpression = envProperty && ts.isPropertyAssignment(envProperty) ? envProperty.initializer.getText(ast) : envProperty && ts.isShorthandPropertyAssignment(envProperty) ? envProperty.name.text : "";
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
        const reviewedProbeEnv = slash(path) === "scripts/f013-local-target.ts" && envExpression === "env" && callee === "execFileSync" &&
          parent && ts.isFunctionDeclaration(parent) && ["realStatus", "queryLocalIdentity"].includes(parent.name?.text ?? "");
        const reviewedDockerEnv = slash(path) === "scripts/f013-docker-identity.ts" && envExpression === "childEnv" && callee === "execFileSync" &&
          parent && ts.isFunctionDeclaration(parent) && ["probeF013Identity", "inspectF013Docker", "runF013DockerPsqlStdin"].includes(parent.name?.text ?? "");
        const reviewedPsqlEnv = slash(path) === "scripts/f013-docker-identity.ts" && envExpression === "env" && callee === "spawnSync" &&
          parent && ts.isFunctionDeclaration(parent) && parent.name?.text === "runF013DockerPsqlStdin";
        const reviewedCommandEnv = (["scripts/f013-restore-plan.ts", "tests/commerce/f013-proof-cli.ts"].includes(slash(path)) && envExpression === "command.env") ||
          (slash(path) === "scripts/f013-restore-plan.ts" && envExpression === "check.env" && parent && ts.isFunctionDeclaration(parent) && parent.name?.text === "executeF013LocalRestore");
        if (!envExpression || !(/^(?:f013LocalChildEnv|productionChildEnv|sanitizedF013Environment)\s*\(/.test(envExpression) || approvedEnvs.has(envExpression) || reviewedCommandEnv || reviewedProbeEnv || reviewedDockerEnv || reviewedPsqlEnv)) {
          violations.push(`${slash(path)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1} ${callee} lacks approved environment`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return violations;
}

describe("F013 executable source boundaries", () => {
  it("has one approved production environment-file reader across scripts, tests, and lib", () => {
    for (const path of sources.filter((candidate) => !safetyTests.has(slash(candidate)) && slash(candidate) !== "scripts/f013-production-env.mjs")) {
      expect(environmentFileViolations(path, source(path)), path).toEqual([]);
    }
    expect(environmentFileViolations("scripts/f013-production-env.mjs", source("scripts/f013-production-env.mjs"))).toContain(".env.local");
    const packageScripts = (JSON.parse(source("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(environmentFileViolations("package-scripts.ts", `const scripts = ${JSON.stringify(packageScripts)}`)).toEqual([]);
  });

  it.each([
    'readFileSync(".env.local")',
    'readFile(".env.local")',
    'fs.promises.readFile(".env" + ".local")',
    'createReadStream(".env.local")',
    'dotenv.config()',
    'import { loadEnvConfig } from "@next/env"',
    'process.execArgv.push("--env-file=.env.local")',
    'process.loadEnvFile(file)',
    'util.parseEnv("KEY=value")',
    'const envPath = join(root, ".env" + ".local"); readFileSync(envPath)',
    'readFileSync(resolve(root, envFile))',
  ])("detects environment-file bypass: %s", (sample) => {
    expect(environmentFileViolations("mutation.ts", sample).length).toBeGreaterThan(0);
  });

  it("does not pass a whole inherited environment to child processes", () => {
    for (const path of sources.filter((candidate) => !safetyTests.has(slash(candidate)))) {
      expect(inheritedEnvironmentViolations(path, source(path)), path).toEqual([]);
    }
    expect(source("tests/auth/fixture-session.ts")).toContain("f013LocalChildEnv(localTarget!)");
    expect(source("tests/browser/feature010-price-admin.browser.mjs")).toContain("productionChildEnv(undefined, env)");
  });

  it.each([
    'execFileSync("node", [], { env: process.env })',
    'execFileSync("node", [], { env: { ...process.env, EXTRA: "1" } })',
    'const inherited = process.env; spawn("node", [], { env: inherited })',
    'Object.assign({}, process.env)',
  ])("detects whole-environment inheritance: %s", (sample) => {
    expect(inheritedEnvironmentViolations("mutation.ts", sample).length).toBeGreaterThan(0);
  });

  it("requires explicit environment or reviewed allowlist for every scripts/tests child", () => {
    const violations = sources.filter((candidate) => !safetyTests.has(slash(candidate)) && /^(?:scripts|tests)\//.test(slash(candidate))).flatMap((path) => childEnvironmentViolations(path, source(path)));
    expect(violations).toEqual([]);
    for (const sample of ['execFileSync("node", ["seed-test-fixtures.ts"])', 'spawn("node", ["f013-live.ts"], { cwd: "." })', 'childProcess.spawn("node", ["f013-live.ts"])']) {
      expect(childEnvironmentViolations("tests/commerce/f013-live.ts", `import { execFileSync, spawn } from "node:child_process"; import * as childProcess from "node:child_process"; ${sample}`)).toHaveLength(1);
    }
    expect(childEnvironmentViolations("tests/commerce/f013-live.cjs", 'const { spawn } = require("node:child_process"); spawn("node", [])')).toHaveLength(1);
    const imported = 'import { execFileSync, spawn } from "node:child_process"; ';
    expect(childEnvironmentViolations("tests/commerce/f013-live.ts", `${imported}execFileSync("node", ["seed-test-fixtures.ts"], { env: productionChildEnv() })`)).toEqual([]);
    expect(childEnvironmentViolations("tests/commerce/f013-live.ts", `${imported}execFileSync("node", [], { env: process.env })`)).toHaveLength(1);
    expect(childEnvironmentViolations("tests/commerce/f013-live.ts", `${imported}spawn("node", [], { env: { ...process.env } })`)).toHaveLength(1);
    expect(childEnvironmentViolations("tests/commerce/f013-live.ts", `${imported}spawn("node", [], { env: {} })`)).toHaveLength(1);
    expect(childEnvironmentViolations("tests/orders/audits.test.ts", `${imported}execFileSync("git", ["status"])`)).toEqual([]);
    expect(childEnvironmentViolations("tests/commerce/review.ts", `${imported}execFileSync("git", ["status"])`)).toHaveLength(1);
  });

  it("keeps --linked out of every executable script, test, and lib path except the reviewed builder", () => {
    for (const path of sources.filter((candidate) => !safetyTests.has(slash(candidate)) && slash(candidate) !== "scripts/f013-local-target.ts")) {
      expect(linkedLiterals(path, source(path)), path).toEqual([]);
    }
    const builder = source("scripts/f013-local-target.ts");
    expect(linkedLiterals("scripts/f013-local-target.ts", builder).length).toBeGreaterThan(0);
    const production = builder.slice(builder.indexOf("// Historical Batch B production proof only."));
    expect(production).toContain('args: ["supabase", "db", "query", "--linked", "-f", file]');
    const packageScripts = (JSON.parse(source("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(linkedLiterals("package-scripts.ts", `const scripts = ${JSON.stringify(packageScripts)}`)).toEqual([]);
  });

  it.each(['"--linked=true"', '"--linked" + "=false"', 'const flag = "--linked"; use(flag)', 'const base = "--linked"; use(`${base}=true`)'])("detects linked prefix and folded constants: %s", (sample) => {
    expect(linkedLiterals("mutation.ts", sample).length).toBeGreaterThan(0);
  });

  it("rejects unknown F013 case and assignment variants before env load or client creation", () => {
    const script = source("scripts/seed-test-fixtures.ts");
    const main = script.slice(script.indexOf("async function main(): Promise<void> {"));
    expect(main).toContain('argument.toLowerCase().includes("f013")');
    expect(main).toContain("!F013_READ_ONLY_FLAGS.has(f013Flag) && !F013_LOCAL_WRITE_FLAGS.has(f013Flag)");
    for (const marker of ["loadEnvLocal()", "const admin = createAdminClient()"])
      expect(main.indexOf("Unknown F013 operation refused")).toBeLessThan(main.indexOf(marker));
    expect(main.indexOf("const mode = resolveF013Mode()")).toBeLessThan(main.indexOf("Unknown F013 operation refused"));
  });

  it("retains T016 exact identities and T071's two live gates", () => {
    const fixtures = source("tests/commerce/f013-fixtures.test.ts");
    expect(fixtures).toContain("every fixed id is in the reserved 13000000- range and unique");
    expect(fixtures).toContain("cleanup never hard-deletes a business or financial row");
    const session = source("tests/auth/fixture-session.ts");
    expect(session).toContain('process.env.F013_T071_LIVE !== "1" || process.env.F013_LIVE !== "1"');
    expect(session).toContain("loadTestEnvironment();");
    expect(source(".gitignore")).toContain("/tools/f013-local/supabase/.branches/");
  });
});
