import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidSelector, runAssertions, runStaticSuite } from "../src/lib/agents/harness";
import { BASE_SITE } from "../src/lib/base-site";

const failed = (results: { ok: boolean; name: string }[]) => results.filter((r) => !r.ok).map((r) => r.name);

test("la web de partida pasa la suite base", () => {
  assert.deepEqual(failed(runStaticSuite(BASE_SITE)), []);
});

test("detecta enlaces rotos, campos sin label y páginas huérfanas", () => {
  const ws = {
    ...BASE_SITE,
    "contacto.html": `<!doctype html><html lang="es"><head><title>Contacto</title>
      <meta name="viewport" content="width=device-width"><link rel="stylesheet" href="estilos.css"></head>
      <body><h1>Contacto</h1><form><input type="email" name="email"></form></body></html>`,
  };
  const names = failed(runStaticSuite(ws)).join("\n");
  assert.match(names, /contacto\.html · enlaces y recursos locales resuelven/);
  assert.match(names, /contacto\.html · accesibilidad básica/);
  assert.match(names, /contacto\.html · navegación/);
});

test("detecta JavaScript que no compila", () => {
  const results = runStaticSuite({ ...BASE_SITE, "app.js": "function ( {" });
  assert.deepEqual(failed(results), ["app.js · JavaScript compila"]);
});

test("ejecuta los tests de aceptación contra el HTML real", () => {
  const results = runAssertions(
    BASE_SITE,
    [
      { criterion: "c", description: "hay navegación", type: "exists", file: "index.html", selector: "nav a" },
      { criterion: "c", description: "tres talleres", type: "count_gte", file: "index.html", selector: ".card", value: "3" },
      { criterion: "c", description: "título", type: "text_contains", file: "index.html", selector: "h1", value: "CERÁMICA" },
      { criterion: "c", description: "idioma", type: "attr_equals", file: "index.html", selector: "html", attr: "lang", value: "es" },
      { criterion: "c", description: "css", type: "file_contains", file: "styles.css", value: "--accent" },
      { criterion: "c", description: "enlace a contacto", type: "exists", file: "index.html", selector: 'nav a[href="contacto.html"]' },
      { criterion: "c", description: "existe contacto", type: "file_exists", file: "contacto.html" },
    ],
    "acceptance",
  );
  assert.deepEqual(failed(results), ["enlace a contacto", "existe contacto"]);
  assert.match(results[5].detail ?? "", /no hay ninguno/);
});

test("valida selectores antes de aceptar un test", () => {
  assert.equal(isValidSelector('form input[type="email"]'), true);
  assert.equal(isValidSelector("a[href"), false);
});
