import { z } from "zod";
import { ASSERTION_TYPES, type CheckResult, type ReviewIssue } from "@/lib/types";
import type { Workspace } from "./harness";

/**
 * Los tres agentes. Cada uno es un rol (prompt de sistema) + un contrato de salida (Zod).
 * Ninguno habla con otro directamente: el motor (engine.ts) pasa el trabajo de uno a otro
 * y guarda cada paso en la base de datos.
 */

const SITE_RULES = `La web es un sitio estático: solo HTML, CSS y JavaScript sin dependencias,
sin CDNs ni recursos externos, con rutas relativas (p. ej. "styles.css", "contacto.html").
Todo el contenido visible va en español.`;

export function renderWorkspace(ws: Workspace, only?: string[]): string {
  const paths = Object.keys(ws)
    .filter((p) => !only || only.includes(p))
    .sort();
  return paths.map((p) => `=== archivo: ${p} ===\n${ws[p]}`).join("\n\n");
}

// ───────────────────────── Orquestador ─────────────────────────

export const PlanSchema = z.object({
  analysis: z.string(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(3),
        description: z.string().min(10),
        files: z.array(z.string()),
        acceptance: z.array(z.string().min(5)).min(1).max(6),
      }),
    )
    .min(1)
    .max(4),
});

export function planRequest(prompt: string, ws: Workspace) {
  return {
    schema: PlanSchema,
    maxOutputTokens: 2500,
    system: `Eres el ORQUESTADOR de un equipo de tres agentes de IA (Orquestador, Develop y Testing)
que trabaja sobre una web existente. Recibes la petición de un cliente y la divides en tareas
pequeñas para Develop. Después Testing verificará cada tarea con tus criterios de aceptación.

${SITE_RULES}

Reglas del plan:
- Entre 1 y 4 tareas, ordenadas por dependencia. Cada tarea debe poder desarrollarse y probarse sola.
- No inventes trabajo que el cliente no ha pedido.
- Cada tarea lleva de 2 a 5 criterios de aceptación CONCRETOS y verificables leyendo el código
  (existe tal archivo, tal página tiene tal elemento, tal enlace aparece en la navegación de todas
  las páginas…). Nada de criterios subjetivos como «que quede bonito».
- Si se crea una página nueva, incluye su enlace en la navegación de todas las páginas.
- No hay servidor: un formulario no puede enviar datos de verdad; pide validación en el navegador
  y un mensaje de confirmación visible.

Responde SOLO con un objeto JSON con esta forma exacta:
{
  "analysis": "una o dos frases: cómo has entendido la petición",
  "tasks": [
    {
      "title": "título corto en imperativo",
      "description": "qué tiene que hacer Develop, con el detalle necesario",
      "files": ["archivos que previsiblemente se crean o modifican"],
      "acceptance": ["criterio verificable 1", "criterio verificable 2"]
    }
  ]
}`,
    prompt: `PETICIÓN DEL CLIENTE:\n${prompt}\n\nWEB ACTUAL:\n${renderWorkspace(ws)}`,
  };
}

export const SummarySchema = z.object({ summary: z.string().min(10) });

export function summaryRequest(input: {
  prompt: string;
  tasks: { title: string; status: string; attempts: number; devSummary: string | null }[];
  files: string[];
}) {
  return {
    schema: SummarySchema,
    maxOutputTokens: 500,
    system: `Eres el ORQUESTADOR de un equipo de agentes de IA. El trabajo ha terminado y escribes
el informe final para el cliente: 3 o 4 frases en español, claras y sin adornos. Di qué se ha hecho,
qué archivos se han tocado y, si alguna tarea necesitó correcciones o quedó sin aprobar, dilo.
Responde SOLO con JSON: { "summary": "texto" }`,
    prompt: `PETICIÓN: ${input.prompt}\n\nTAREAS:\n${input.tasks
      .map(
        (t, i) =>
          `${i + 1}. ${t.title} — estado: ${t.status}, intentos de desarrollo: ${t.attempts}. ${t.devSummary ?? ""}`,
      )
      .join("\n")}\n\nARCHIVOS DE LA WEB AHORA: ${input.files.join(", ")}`,
  };
}

// ─────────────────────────── Develop ───────────────────────────

export const FILE_PATH = /^[a-z0-9][a-z0-9_\-./]{0,80}\.(html|css|js|svg|json|txt)$/;
export const MAX_FILE_BYTES = 60_000;

export const DevelopSchema = z.object({
  summary: z.string().min(5),
  files: z
    .array(z.object({ path: z.string(), content: z.string() }))
    .min(1)
    .max(6),
});

export function developRequest(input: {
  prompt: string;
  task: { title: string; description: string; acceptance: string[] };
  ws: Workspace;
  attempt: number;
  failures?: CheckResult[];
  issues?: ReviewIssue[];
}) {
  const fixing = input.attempt > 1;
  const feedback = fixing
    ? `\n\nINFORME DE TESTING (intento ${input.attempt - 1}) — ESTO ES LO QUE FALLA Y DEBES CORREGIR:\n${[
        ...(input.failures ?? []).map((f, i) => `${i + 1}. [test] ${f.name} → ${f.detail ?? "falla"}`),
        ...(input.issues ?? []).map(
          (r, i) => `${(input.failures?.length ?? 0) + i + 1}. [revisión] ${r.file}: ${r.problem} → ${r.fix}`,
        ),
      ].join("\n")}\n\nCorrige exactamente esos fallos sin romper lo que ya funciona.`
    : "";

  return {
    schema: DevelopSchema,
    maxOutputTokens: 9000,
    system: `Eres DEVELOP, un desarrollador frontend sénior dentro de un equipo de agentes de IA.
El Orquestador te asigna una tarea y Testing revisará tu trabajo con pruebas automáticas.

${SITE_RULES}

Reglas:
- Haz solo lo que pide la tarea, cumpliendo todos sus criterios de aceptación.
- Respeta el estilo de la web: reutiliza las clases y variables CSS que ya existen y copia la
  cabecera, la navegación y el pie de las páginas existentes en las páginas nuevas.
- HTML semántico y accesible: <!doctype html>, <html lang="es">, <title>, <meta name="viewport">,
  un único <h1> por página, cada campo de formulario con su <label for>, cada <img> con alt, ids únicos.
- Todos los enlaces y recursos locales deben apuntar a archivos que existen.
- Devuelve el CONTENIDO COMPLETO de cada archivo que crees o modifiques (no fragmentos ni diffs).
  No devuelvas archivos que no cambian.
- Nombres de archivo en minúsculas, sin espacios, con extensión .html, .css o .js.

Responde SOLO con un objeto JSON con esta forma exacta:
{
  "summary": "una o dos frases: qué has hecho",
  "files": [ { "path": "ruta/archivo.html", "content": "contenido completo del archivo" } ]
}`,
    prompt: `PETICIÓN ORIGINAL DEL CLIENTE: ${input.prompt}

TU TAREA: ${input.task.title}
${input.task.description}

CRITERIOS DE ACEPTACIÓN:
${input.task.acceptance.map((c, i) => `${i + 1}. ${c}`).join("\n")}${feedback}

ESTADO ACTUAL DE LA WEB:
${renderWorkspace(input.ws)}`,
  };
}

// ─────────────────────────── Testing ───────────────────────────

export const TestPlanSchema = z.object({
  tests: z
    .array(
      z.object({
        criterion: z.string(),
        description: z.string().min(3),
        type: z.enum(ASSERTION_TYPES),
        file: z.string(),
        selector: z.string().nullish(),
        attr: z.string().nullish(),
        value: z.union([z.string(), z.number()]).nullish(),
      }),
    )
    .min(1)
    .max(14),
});

export function testPlanRequest(input: {
  task: { title: string; description: string; acceptance: string[] };
  ws: Workspace;
  touched: string[];
}) {
  return {
    schema: TestPlanSchema,
    maxOutputTokens: 3000,
    system: `Eres TESTING, el agente de QA de un equipo de agentes de IA. Develop acaba de implementar
una tarea y tú escribes los tests de aceptación que un banco de pruebas automático ejecutará contra
sus archivos. Si un test falla, la tarea vuelve a Develop con el detalle del fallo.

Tipos de test disponibles (campo "type"):
- "file_exists": el archivo "file" existe.
- "file_contains": el archivo "file" contiene el texto "value" (sin distinguir mayúsculas). Sirve para CSS y JS.
- "exists": en el HTML "file" hay al menos un elemento que cumple el selector CSS "selector".
- "not_exists": en "file" no hay ningún elemento que cumpla "selector".
- "count_gte": en "file" hay al menos "value" elementos que cumplen "selector".
- "text_contains": el texto de algún elemento "selector" de "file" contiene "value".
- "attr_present": algún elemento "selector" de "file" tiene el atributo "attr".
- "attr_equals": algún elemento "selector" de "file" tiene "attr" igual a "value".

Reglas:
- Escribe entre 1 y 3 tests por criterio de aceptación; cada criterio debe quedar cubierto.
- Lee el código de Develop. Si un criterio SÍ se cumple, escribe el test con selectores que encajen
  con su HTML real (el test debe pasar). Si un criterio NO se cumple, escribe el test que debería
  cumplirse (fallará, y eso es lo correcto). No apruebes por aprobar ni suspendas por suspender.
- Selectores CSS estándar y sencillos: etiquetas, clases, ids, atributos y descendientes
  (p. ej. nav a[href="contacto.html"], form input[type="email"][required]). Sin pseudo-clases raras.
- "file" es siempre la ruta exacta de un archivo de la web.
- No pruebes cosas que la tarea no pide.

Responde SOLO con un objeto JSON con esta forma exacta:
{
  "tests": [
    {
      "criterion": "criterio de aceptación que verifica",
      "description": "qué comprueba, en una frase",
      "type": "exists",
      "file": "contacto.html",
      "selector": "form input[type=\\"email\\"]",
      "attr": null,
      "value": null
    }
  ]
}`,
    prompt: `TAREA: ${input.task.title}
${input.task.description}

CRITERIOS DE ACEPTACIÓN:
${input.task.acceptance.map((c, i) => `${i + 1}. ${c}`).join("\n")}

ARCHIVOS DE LA WEB: ${Object.keys(input.ws).sort().join(", ")}

CÓDIGO QUE HA ESCRITO DEVELOP:
${renderWorkspace(input.ws, input.touched)}`,
  };
}

export const ReviewSchema = z.object({
  approved: z.boolean(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["bloqueante", "menor"]),
        file: z.string(),
        problem: z.string(),
        fix: z.string(),
      }),
    )
    .max(6),
});

export function reviewRequest(input: {
  task: { title: string; description: string; acceptance: string[] };
  ws: Workspace;
  touched: string[];
}) {
  return {
    schema: ReviewSchema,
    maxOutputTokens: 1500,
    system: `Eres TESTING, el agente de QA de un equipo de agentes de IA. Los tests automáticos de esta
tarea ya pasan. Ahora haces la revisión de código final, buscando lo que un test de selectores no ve.

Marca como "bloqueante" SOLO defectos reales y demostrables en el código, por ejemplo:
- un criterio de aceptación que en realidad no se cumple;
- JavaScript con un error de lógica que impide que la función funcione (ids que no coinciden con el
  HTML, eventos que no se enganchan, validación que nunca se ejecuta);
- contenido roto o texto de relleno sin sustituir (lorem ipsum, TODO);
- una página nueva que no reutiliza la cabecera o la hoja de estilos de la web.
Usa "menor" para sugerencias de mejora. Las preferencias de estilo NO son bloqueantes.
Si todo está bien, devuelve approved true y la lista vacía. No inventes problemas.

Responde SOLO con un objeto JSON con esta forma exacta:
{
  "approved": true,
  "issues": [
    { "severity": "bloqueante", "file": "archivo", "problem": "qué está mal", "fix": "cómo arreglarlo" }
  ]
}`,
    prompt: `TAREA: ${input.task.title}
${input.task.description}

CRITERIOS DE ACEPTACIÓN:
${input.task.acceptance.map((c, i) => `${i + 1}. ${c}`).join("\n")}

CÓDIGO A REVISAR:
${renderWorkspace(input.ws, input.touched)}`,
  };
}
