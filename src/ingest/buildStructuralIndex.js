function addUnique(target, value) {
  if (value && !target.includes(value)) target.push(value);
}

export function buildStructuralIndex(repo) {
  const files = repo.files.map((file) => {
    const symbols = [];
    const imports = [];
    const signals = [];

    file.content.split("\n").forEach((line, index) => {
      const number = index + 1;
      const functionMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:export\s+)?class\s+([A-Za-z_$][\w$]*)|^\s*def\s+([A-Za-z_][\w]*)|^\s*class\s+([A-Za-z_][\w]*)/);
      if (functionMatch) {
        const name = functionMatch.slice(1).find(Boolean);
        symbols.push({ name, line: number, kind: line.includes("class") ? "class" : "function" });
      }

      const importMatch = line.match(/(?:from\s+["']([^"']+)["']|import\s+.*?from\s+["']([^"']+)["']|^\s*from\s+([\w.]+)\s+import)/);
      if (importMatch) addUnique(imports, importMatch.slice(1).find(Boolean));

      if (/onClick|onSubmit|addEventListener\s*\(/.test(line)) signals.push({ type: "event", line: number, text: line.trim().slice(0, 140) });
      if (/fetch\s*\(|axios\.|requests\.|httpx\.|chat\/completions|\/api\//.test(line)) signals.push({ type: "request", line: number, text: line.trim().slice(0, 140) });
      if (/localStorage|sessionStorage|indexedDB|sqlite|prisma|mongoose|ModelContext|database/i.test(line)) signals.push({ type: "storage", line: number, text: line.trim().slice(0, 140) });
      if (/FastAPI|Flask|APIRouter|app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch)/.test(line)) signals.push({ type: "route", line: number, text: line.trim().slice(0, 140) });
    });

    return { path: file.path, role: file.role, language: file.language, symbols: symbols.slice(0, 30), imports: imports.slice(0, 20), signals: signals.slice(0, 30) };
  });

  const text = files
    .filter((file) => file.symbols.length || file.signals.length || file.role !== "source")
    .slice(0, 80)
    .map((file) => {
      const symbols = file.symbols.map((item) => `${item.name}@L${item.line}`).join(", ");
      const signals = file.signals.map((item) => `${item.type}@L${item.line}: ${item.text}`).join(" | ");
      return `[${file.path}] role=${file.role}; symbols=${symbols || "-"}; signals=${signals || "-"}`;
    })
    .join("\n");

  return { files, text };
}
