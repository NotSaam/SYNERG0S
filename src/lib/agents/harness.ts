import vm from "node:vm";
import { parse, type HTMLElement } from "node-html-parser";
import type { Assertion, CheckResult } from "@/lib/types";

/**
 * Banco de pruebas de Testing. Aquí NO hay IA: es código determinista que
 * ejecuta de verdad las comprobaciones contra los archivos que escribió Develop.
 *
 *  - runStaticSuite: suite base que debe cumplir cualquier página (HTML válido,
 *    enlaces que resuelven, accesibilidad mínima, JS que compila…).
 *  - runAssertions: tests de aceptación que el agente Testing escribe para cada tarea.
 */

export type Workspace = Record<string, string>;

const isHtml = (p: string) => p.endsWith(".html");

function dom(content: string): HTMLElement {
  return parse(content, { comment: false });
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Resuelve una ruta relativa (href/src) respecto al archivo que la contiene. */
function resolvePath(from: string, ref: string): string {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts = (ref.startsWith("/") ? ref.slice(1) : base + ref).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function isExternal(ref: string): boolean {
  return /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref);
}

/** Comprueba que un selector CSS es válido para el motor que ejecuta los tests. */
export function isValidSelector(selector: string): boolean {
  try {
    dom("<html><body></body></html>").querySelectorAll(selector);
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── Suite base ─────────────────────────

export function runStaticSuite(ws: Workspace): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (file: string, name: string, problems: string[]) =>
    results.push({
      suite: "static",
      file,
      name: `${file} · ${name}`,
      ok: problems.length === 0,
      detail: problems.length ? problems.slice(0, 6).join(" | ") : undefined,
    });

  const htmlFiles = Object.keys(ws).filter(isHtml).sort();
  const docs = new Map(htmlFiles.map((f) => [f, dom(ws[f])]));

  for (const file of htmlFiles) {
    const root = docs.get(file)!;
    const raw = ws[file];

    // Estructura mínima del documento
    const structure: string[] = [];
    if (!/^\s*<!doctype html>/i.test(raw)) structure.push("falta <!doctype html> al inicio");
    if (!root.querySelector("html")?.getAttribute("lang")) structure.push("falta el atributo lang en <html>");
    if (!root.querySelector("title")?.text.trim()) structure.push("falta un <title> con texto");
    if (!root.querySelector('meta[name="viewport"]')) structure.push('falta <meta name="viewport">');
    const h1 = root.querySelectorAll("h1").length;
    if (h1 !== 1) structure.push(`debe haber exactamente un <h1> (hay ${h1})`);
    add(file, "estructura del documento", structure);

    // Enlaces y recursos locales
    const refs: string[] = [];
    const targets = [
      ...root.querySelectorAll("a[href]").map((el) => el.getAttribute("href")!),
      ...root.querySelectorAll("link[href]").map((el) => el.getAttribute("href")!),
      ...root.querySelectorAll("script[src]").map((el) => el.getAttribute("src")!),
      ...root.querySelectorAll("img[src]").map((el) => el.getAttribute("src")!),
    ];
    for (const ref of targets) {
      if (!ref || isExternal(ref)) continue;
      const [pathPart, hash] = ref.split("#");
      const target = pathPart ? resolvePath(file, pathPart.split("?")[0]) : file;
      if (!(target in ws)) {
        refs.push(`"${ref}" apunta a un archivo que no existe (${target})`);
        continue;
      }
      if (hash && isHtml(target)) {
        const targetDoc = docs.get(target);
        const found = targetDoc?.querySelectorAll("[id]").some((el) => el.getAttribute("id") === hash);
        if (!found) refs.push(`"${ref}" apunta al ancla #${hash}, que no existe en ${target}`);
      }
    }
    add(file, "enlaces y recursos locales resuelven", refs);

    // IDs únicos
    const seen = new Map<string, number>();
    for (const el of root.querySelectorAll("[id]")) {
      const id = el.getAttribute("id")!;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    add(
      file,
      "ids únicos",
      [...seen].filter(([, n]) => n > 1).map(([id, n]) => `id="${id}" repetido ${n} veces`),
    );

    // Accesibilidad mínima
    const a11y: string[] = [];
    for (const img of root.querySelectorAll("img")) {
      if (img.getAttribute("alt") === undefined) a11y.push(`<img src="${img.getAttribute("src") ?? ""}"> sin atributo alt`);
    }
    const labelsFor = new Set(root.querySelectorAll("label[for]").map((l) => l.getAttribute("for")));
    for (const control of root.querySelectorAll("input, select, textarea")) {
      const type = (control.getAttribute("type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      const id = control.getAttribute("id");
      const labelled =
        (id && labelsFor.has(id)) ||
        control.getAttribute("aria-label") ||
        control.getAttribute("aria-labelledby") ||
        control.closest("label");
      if (!labelled) {
        const ref = id ? `#${id}` : `[name="${control.getAttribute("name") ?? "?"}"]`;
        a11y.push(`el campo <${control.rawTagName}> ${ref} no tiene <label for> asociado`);
      }
    }
    for (const form of root.querySelectorAll("form")) {
      const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (!submit) a11y.push("hay un <form> sin botón de envío");
    }
    add(file, "accesibilidad básica (alt, labels, envío)", a11y);

    // Scripts en línea: deben compilar
    const inline: string[] = [];
    root.querySelectorAll("script").forEach((script, i) => {
      if (script.getAttribute("src")) return;
      const type = (script.getAttribute("type") ?? "").toLowerCase();
      if (type && !["text/javascript", "application/javascript"].includes(type)) return;
      const error = jsSyntaxError(script.text);
      if (error) inline.push(`<script> en línea nº ${i + 1}: ${error}`);
    });
    if (root.querySelectorAll("script").length) add(file, "scripts en línea compilan", inline);
  }

  // Navegación: ninguna página huérfana
  if (htmlFiles.includes("index.html")) {
    const reachable = new Set<string>(["index.html"]);
    const queue = ["index.html"];
    while (queue.length) {
      const current = queue.shift()!;
      for (const a of docs.get(current)!.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href")!;
        if (isExternal(href)) continue;
        const pathPart = href.split("#")[0].split("?")[0];
        if (!pathPart) continue;
        const target = resolvePath(current, pathPart);
        if (isHtml(target) && target in ws && !reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
    for (const file of htmlFiles) {
      if (file === "index.html") continue;
      const problems: string[] = [];
      if (!reachable.has(file)) problems.push(`ninguna página enlaza a ${file} (añádela a la navegación)`);
      const back = docs
        .get(file)!
        .querySelectorAll("a[href]")
        .some((a) => resolvePath(file, a.getAttribute("href")!.split("#")[0] || file) === "index.html");
      if (!back) problems.push(`${file} no tiene ningún enlace de vuelta a index.html`);
      add(file, "navegación (página alcanzable y con vuelta al inicio)", problems);
    }
  }

  // CSS y JS sueltos
  for (const file of Object.keys(ws).sort()) {
    if (file.endsWith(".css")) {
      const css = ws[file].replace(/\/\*[\s\S]*?\*\//g, "");
      const open = (css.match(/{/g) ?? []).length;
      const close = (css.match(/}/g) ?? []).length;
      add(file, "llaves CSS balanceadas", open === close ? [] : [`${open} «{» frente a ${close} «}»`]);
    }
    if (file.endsWith(".js")) {
      const error = jsSyntaxError(ws[file]);
      add(file, "JavaScript compila", error ? [error] : []);
    }
  }

  return results;
}

/** Compila sin ejecutar: detecta errores de sintaxis en el JS que escribe Develop. */
function jsSyntaxError(code: string): string | null {
  try {
    new vm.Script(code);
    return null;
  } catch (err) {
    return err instanceof Error ? `error de sintaxis: ${err.message}` : "error de sintaxis";
  }
}

// ───────────────────── Tests de aceptación ─────────────────────

export function runAssertions(
  ws: Workspace,
  assertions: Assertion[],
  suite: "acceptance" | "regression",
): CheckResult[] {
  const cache = new Map<string, HTMLElement>();
  const docOf = (file: string) => {
    if (!cache.has(file)) cache.set(file, dom(ws[file]));
    return cache.get(file)!;
  };

  return assertions.map((a): CheckResult => {
    const base = { suite, name: a.description, file: a.file } as const;
    const fail = (detail: string): CheckResult => ({ ...base, ok: false, detail });
    const pass = (): CheckResult => ({ ...base, ok: true });

    if (!(a.file in ws)) return fail(`el archivo ${a.file} no existe`);
    const content = ws[a.file];

    if (a.type === "file_exists") return pass();
    if (a.type === "file_contains") {
      const needle = a.value ?? "";
      return normalize(content).includes(normalize(needle))
        ? pass()
        : fail(`${a.file} debe contener «${needle}» y no aparece`);
    }

    if (!isHtml(a.file)) return fail(`${a.file} no es HTML: no se le puede aplicar un selector`);
    const selector = a.selector ?? "";
    let nodes: HTMLElement[];
    try {
      nodes = docOf(a.file).querySelectorAll(selector);
    } catch {
      return fail(`selector no válido: ${selector}`);
    }
    const where = `${a.file} → ${selector}`;

    switch (a.type) {
      case "exists":
        return nodes.length ? pass() : fail(`se esperaba al menos un elemento ${where} y no hay ninguno`);
      case "not_exists":
        return nodes.length ? fail(`no debería existir ${where} y hay ${nodes.length}`) : pass();
      case "count_gte": {
        const min = Number.parseInt(a.value ?? "1", 10) || 1;
        return nodes.length >= min
          ? pass()
          : fail(`se esperaban al menos ${min} elementos ${where} y hay ${nodes.length}`);
      }
      case "text_contains": {
        if (!nodes.length) return fail(`no existe ${where}`);
        const needle = normalize(a.value ?? "");
        return nodes.some((n) => normalize(n.text).includes(needle))
          ? pass()
          : fail(`el texto de ${where} debe contener «${a.value}». Texto actual: «${nodes[0].text.trim().slice(0, 120)}»`);
      }
      case "attr_present": {
        if (!nodes.length) return fail(`no existe ${where}`);
        return nodes.some((n) => n.getAttribute(a.attr ?? "") !== undefined)
          ? pass()
          : fail(`${where} debe tener el atributo ${a.attr}`);
      }
      case "attr_equals": {
        if (!nodes.length) return fail(`no existe ${where}`);
        const actual = nodes.map((n) => n.getAttribute(a.attr ?? ""));
        return actual.some((v) => v !== undefined && normalize(v) === normalize(a.value ?? ""))
          ? pass()
          : fail(`${where} debe tener ${a.attr}="${a.value}". Valor actual: ${JSON.stringify(actual[0] ?? null)}`);
      }
      default:
        return fail(`tipo de test desconocido: ${String(a.type)}`);
    }
  });
}
