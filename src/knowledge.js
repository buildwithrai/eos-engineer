const BLANKET_REF = "REPOSITORY KNOWLEDGE";

const PREFIXES = ["symbol:", "package:", "import:", "export:", "dependency:"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildKnowledgeProjection(knowledge) {
  if (knowledge === undefined) return undefined;

  const k = knowledge.knowledge ?? {};
  const repo = k.repository ?? {};

  const packages = asArray(repo.packages);
  const symbols = asArray(k.symbols);
  const imports = asArray(k.imports);
  const exports = asArray(k.exports);
  const packageDependencies = asArray(k.packageDependencies);

  const sourceFilePaths = asArray(repo.sourceFilePaths);
  const sourceFileCount =
    sourceFilePaths.length > 0
      ? sourceFilePaths.length
      : typeof repo.sourceFiles === "number"
        ? repo.sourceFiles
        : 0;

  const parts = [
    `${BLANKET_REF}\nRoot: ${repo.root ?? ""}\nPackages: ${packages.length > 0 ? packages.join(", ") : "(none)"}\nSource files: ${sourceFileCount}\nSymbols: ${symbols.length}`,
  ];

  if (packages.length > 0) {
    parts.push(`PACKAGES\n${packages.map((p) => `- ${p}`).join("\n")}`);
  }

  if (symbols.length > 0) {
    parts.push(
      `SYMBOLS\n${symbols
        .map((symbol) => {
          const kind = symbol.kind ? ` (${symbol.kind})` : "";
          const file = symbol.file ? ` — ${symbol.file}` : "";
          return `- ${symbol.name}${kind}${file}`;
        })
        .join("\n")}`
    );
  }

  if (imports.length > 0) {
    parts.push(
      `IMPORTS\n${imports
        .map((entry) => {
          const specifier = entry.specifier ? ` (${entry.specifier})` : "";
          const resolved = entry.resolvedFile ? ` -> ${entry.resolvedFile}` : "";
          return `- ${entry.file}${specifier}${resolved}`;
        })
        .join("\n")}`
    );
  }

  if (exports.length > 0) {
    parts.push(
      `EXPORTS\n${exports.map((entry) => `- ${entry.file} -> ${entry.symbol}`).join("\n")}`
    );
  }

  if (packageDependencies.length > 0) {
    parts.push(
      `PACKAGE DEPENDENCIES\n${packageDependencies
        .map((entry) => `- ${entry.package} -> ${entry.dependency}`)
        .join("\n")}`
    );
  }

  return parts.join("\n");
}

export function isKnowledgeRef(ref, knowledge) {
  if (knowledge === undefined) return false;
  if (typeof ref !== "string") return false;
  if (ref === BLANKET_REF) return true;
  return resolveKnowledgeEntityRef(ref, knowledge).ok;
}

export function resolveKnowledgeEntityRef(ref, knowledge) {
  if (knowledge === undefined) return { ok: false, kind: "none" };
  if (typeof ref !== "string") return { ok: false, kind: "none" };

  const k = knowledge.knowledge ?? {};

  if (ref.startsWith("symbol:")) {
    const name = trim(ref.slice("symbol:".length));
    const symbols = asArray(k.symbols);

    if (symbols.some((symbol) => symbol.name === name)) {
      return { ok: true, kind: "symbol", value: name };
    }

    return { ok: false, kind: "symbol" };
  }

  if (ref.startsWith("package:")) {
    const name = trim(ref.slice("package:".length));
    const packages = asArray(k.repository?.packages);

    if (packages.includes(name)) {
      return { ok: true, kind: "package", value: name };
    }

    return { ok: false, kind: "package" };
  }

  if (ref.startsWith("import:")) {
    const [from, to] = ref.slice("import:".length).split("->");
    const file = trim(from);
    const resolvedFile = trim(to);
    const imports = asArray(k.imports);

    if (
      imports.some(
        (entry) => entry.file === file && entry.resolvedFile === resolvedFile
      )
    ) {
      return { ok: true, kind: "import", value: `${file}->${resolvedFile}` };
    }

    return { ok: false, kind: "import" };
  }

  if (ref.startsWith("export:")) {
    const rest = ref.slice("export:".length);
    const separator = rest.indexOf(":");
    const file = trim(separator >= 0 ? rest.slice(0, separator) : rest);
    const symbol = trim(separator >= 0 ? rest.slice(separator + 1) : "");
    const exports = asArray(k.exports);

    if (
      exports.some(
        (entry) => entry.file === file && entry.symbol === symbol
      )
    ) {
      return { ok: true, kind: "export", value: `${file}:${symbol}` };
    }

    return { ok: false, kind: "export" };
  }

  if (ref.startsWith("dependency:")) {
    const [pkg, dep] = ref.slice("dependency:".length).split("->");
    const packageName = trim(pkg);
    const dependency = trim(dep);
    const packageDependencies = asArray(k.packageDependencies);

    if (
      packageDependencies.some(
        (entry) => entry.package === packageName && entry.dependency === dependency
      )
    ) {
      return { ok: true, kind: "dependency", value: `${packageName}->${dependency}` };
    }

    return { ok: false, kind: "dependency" };
  }

  return { ok: false, kind: "none" };
}

export function isKnowledgeEntityRef(ref) {
  if (typeof ref !== "string") return false;
  return PREFIXES.some((prefix) => ref.startsWith(prefix));
}
