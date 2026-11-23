# SYNERG0S — equipo de 3 agentes de IA

Tres agentes de IA que se reparten una petición sobre una web y trabajan hasta que todas las pruebas pasan:

1. **Orquestador** — recibe la petición («añade una página de contacto a esta web»), la divide en tareas con criterios de aceptación y decide a quién le toca cada una.
2. **Develop** — implementa cada tarea escribiendo los archivos de la web.
3. **Testing** — escribe y ejecuta las pruebas de cada tarea y devuelve a Develop lo que falla, hasta que todo pasa.

En pantalla se ve en directo qué hace cada agente, en qué columna del tablero está cada tarea, la bitácora completa y la web resultante.

- **App:** https://synerg0s.vercel.app
- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Postgres en Supabase (plan gratuito) con Drizzle · AI SDK · Vercel (plan Hobby)

## Los `.md` de los agentes

El mismo reparto que ejecuta la app es el que se usa para programarla con Claude Code:

| Agente | Archivo | Papel |
| --- | --- | --- |
| Orquestador | [`CLAUDE.md`](CLAUDE.md) | Agente principal: divide la petición en tareas con criterios de aceptación, reparte y lleva el estado |
| Develop | [`.claude/agents/develop.md`](.claude/agents/develop.md) | Subagente que programa, con las normas de cómo se programa en este repositorio |
| Testing | [`.claude/agents/testing.md`](.claude/agents/testing.md) | Subagente con las **DIRECTRICES** (D1–D13) que Develop tiene que cumplir; revisa cada entrega y devuelve los fallos hasta que todo pasa |

Cómo se usaron de verdad, con lo que aprobó y lo que no pudo verificar Testing, en [Cómo se usó Claude Code](#cómo-se-usó-claude-code).

## Cómo funciona

```mermaid
flowchart LR
    U([Petición]) --> O[Orquestador<br/>planifica]
    O -->|tarea + criterios| D[Develop<br/>escribe archivos]
    D -->|entrega| T[Testing<br/>ejecuta pruebas]
    T -->|fallos con detalle| D
    T -->|todo en verde| O
    O -->|siguiente tarea| D
    O --> F([Verificación final<br/>e informe])
```

«Esta web» es un sitio estático de ejemplo (un taller de cerámica: `index.html` + `styles.css`). Cada petición recibe su propia copia en la base de datos y los agentes trabajan sobre ella. El resultado se puede ver en un iframe y leer archivo a archivo.

### El bucle Develop ⇄ Testing

Estados de una tarea: `pending → developing → testing → (fixing → testing)* → passed | failed`.

Lo importante es que **Testing no opina: ejecuta**. Cada ronda de pruebas tiene tres partes y solo la primera y la última usan IA:

| Parte | Quién | Qué hace |
| --- | --- | --- |
| Tests de aceptación | IA (una vez por tarea) | Lee el código de Develop y los criterios del Orquestador y escribe tests como datos: `{ type: "exists", file: "contacto.html", selector: "form input[type=email][required]" }` |
| Ejecución | Código determinista ([`harness.ts`](src/lib/agents/harness.ts)) | Ejecuta esos tests con un parser de HTML real, más una **suite base** (enlaces que resuelven, ids únicos, `label` en cada campo, `alt`, un solo `h1`, páginas alcanzables desde el inicio, JS que compila…) y la **regresión** de las tareas ya aprobadas |
| Revisión de código | IA (solo con todo en verde) | Busca lo que un selector no ve: lógica JS rota, criterios que en realidad no se cumplen |

Si algo falla, la tarea vuelve a Develop con el detalle exacto («se esperaba al menos un elemento `nav a[href="contacto.html"]` en index.html y no hay ninguno»). Tras 4 entregas fallidas la tarea se marca como fallida y el Orquestador sigue con las demás. La revisión de código solo puede bloquear en las dos primeras entregas, para que el bucle siempre termine.

### El motor: una máquina de estados en Postgres

Vercel no ejecuta procesos largos, así que el equipo no es un bucle en memoria. [`engine.ts`](src/lib/agents/engine.ts) expone `advance(runId)`, que ejecuta **un turno de un agente** y lo guarda:

- Un cerrojo atómico (`UPDATE … WHERE lock_until < now() RETURNING`) garantiza que solo una invocación avanza cada ejecución, aunque haya varias pestañas abiertas.
- Cada turno es idempotente: el estado solo cambia al final. Si la función muere a medias, el siguiente intento repite el turno.
- El navegador llama a `POST /api/runs/:id/step` en bucle y sondea `GET /api/runs/:id?after=<últimoEvento>` cada 1,2 s. Si cierras la pestaña, al volver a abrirla la ejecución continúa donde estaba.
- Los planes gratuitos de IA fallan a ratos: cuota agotada (429) o modelo saturado (503). `LLM_MODEL` admite una cadena de modelos (principal y reservas) y, si ninguno responde, la ejecución se pausa con espera creciente y se reanuda sola; en pantalla el agente pasa a «Esperando a la IA». Tras 30 esperas seguidas se detiene y ofrece reintentar. Opcionalmente, `LLM_FALLBACK_*` añade un segundo proveedor.

### Modelo de datos

| Tabla | Contenido |
| --- | --- |
| `users` | Usuario de prueba (contraseña con bcrypt) |
| `runs` | Petición, estado, agente activo, cerrojo, consumo de IA, informe final |
| `tasks` | Tareas del plan: criterios, estado, intentos, tests escritos por Testing y último informe |
| `events` | Bitácora: todo lo que dice y hace cada agente |
| `files` | Espacio de trabajo: los archivos de la web de cada ejecución |

## Estructura

```
src/
  lib/agents/
    roles.ts      Los 3 agentes: prompt de sistema + contrato de salida (Zod)
    engine.ts     Máquina de estados que pasa el trabajo de uno a otro
    harness.ts    Banco de pruebas determinista (suite base + tests de aceptación)
  lib/llm.ts      Proveedor de IA configurable por entorno
  lib/runs.ts     Consultas y creación de ejecuciones
  db/schema.ts    Esquema Drizzle
  app/api/        login, runs, step, files, retry
  app/preview/    Sirve la web generada (en sandbox)
  components/     Tablero, tarjetas de agentes, bitácora, vista previa
tests/            Tests del banco de pruebas y de la configuración de la base de datos (node:test)
```

## Ejecutarlo en local

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run db:push              # crea las tablas en Supabase
npm run db:seed              # crea el usuario de prueba
npm run dev
```

Otros comandos: `npm test` (banco de pruebas y configuración de la base de datos), `npm run typecheck`, `npm run lint`, `npm run build`.

### Variables de entorno

Ninguna clave está en el repositorio: viven en `.env.local` (ignorado por git) y en las variables de entorno de Vercel. Ver [`.env.example`](.env.example).

| Variable | Para qué |
| --- | --- |
| `POSTGRES_URL` | Postgres de Supabase por el pooler en modo transacción (puerto 6543): es la conexión que usa la app. En Vercel la inyecta la integración de Supabase del Marketplace |
| `POSTGRES_URL_NON_POOLING` | Conexión de sesión (puerto 5432): la usa `npm run db:push` para crear las tablas. También la inyecta la integración |
| `DATABASE_URL` | Opcional. Solo se lee si falta `POSTGRES_URL` (un Postgres que no venga de esa integración) |
| `AUTH_SECRET` | Firma de la cookie de sesión (JWT HS256, `httpOnly`) |
| `DEMO_USER`, `DEMO_PASSWORD` | Usuario de prueba que crea `npm run db:seed` |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Cualquier API compatible con OpenAI con plan gratuito (Gemini, Groq, Mistral…). `LLM_MODEL` puede ser una lista separada por comas, cada modelo con su esfuerzo de razonamiento opcional (`modelo@none`) |

## Todo en planes gratuitos

- **Vercel Hobby** para la app.
- **Supabase Free** para Postgres.
- **IA:** plan gratuito de Gemini (Google AI Studio, sin tarjeta). El primer intento fue Vercel AI Gateway, pero exige una tarjeta para liberar el crédito gratuito, así que la app habla con cualquier API compatible con OpenAI y el proveedor se elige por entorno con `LLM_*`.
- **Lo que da de sí la cuota gratuita:** los modelos Flash admiten 20 peticiones al día cada uno y los Flash-Lite, más, pero en horas punta responden 503. Una petición al equipo son entre 10 y 15 llamadas, así que la app encadena varios modelos (`LLM_MODEL=modelo@nivel,…`) y pasa al siguiente cuando uno está sin cuota o saturado. Si la demo muestra «Esperando a la IA», es esto: sigue sola en cuanto algún modelo responde.
- Para proteger esa cuota: acceso con usuario de prueba y un tope diario de peticiones (`MAX_RUNS_PER_DAY`).

## Seguridad

- El código que escribe la IA se trata como **no fiable**: la vista previa se sirve con `Content-Security-Policy: sandbox` y dentro de un iframe `sandbox` sin `allow-same-origin`, así que no puede leer la cookie de sesión ni llamar a la API de la app.
- El JavaScript generado nunca se ejecuta en el servidor: el banco de pruebas solo lo compila (`vm.Script`) para detectar errores de sintaxis.
- Cada ruta de la API comprueba la sesión y que la ejecución pertenece al usuario.
- Las cinco tablas tienen **Row Level Security** activada y ninguna política: Supabase expone el esquema `public` por su API de datos, y así la clave anónima no puede leer ni escribir. La app se conecta como propietaria de las tablas y no le afecta.
- Las rutas de los archivos que devuelve Develop se validan (extensiones permitidas, sin `..`, tamaño máximo).

## Límites conocidos y siguientes pasos

- Testing verifica el HTML/CSS/JS de forma estática. No abre un navegador: no prueba el comportamiento del JS en ejecución. El siguiente paso sería lanzar Playwright en un sandbox aislado.
- El navegador conduce la ejecución. Para que avance sin ninguna pestaña abierta habría que mover el bucle a una cola o a un workflow durable.
- El estado llega por sondeo, que es suficiente para turnos de varios segundos; con más volumen pasaría a SSE.
- Un solo usuario de prueba, sin registro.
- Supabase pausa los proyectos gratuitos tras un periodo sin actividad. Si la app devuelve un error de base de datos al entrar, es eso: se reactiva desde el panel de Supabase.

## Cómo se usó Claude Code

Todo el proyecto se programó con **Claude Code** (app de escritorio), a partir del enunciado de la prueba. Tuvo dos fases y las cuento como fueron.

### Fase 1 — la app, en una sesión

La primera versión completa la escribió Claude Code como agente único, sin subagentes y con la base de datos en Neon:

1. **Enunciado → diseño.** Claude Code recibió el enunciado tal cual y propuso la arquitectura: máquina de estados persistida en vez de un bucle en memoria (por los límites de las funciones serverless), tests ejecutados por código y no «opinados» por la IA, y vista previa en sandbox.
2. **Documentación antes que memoria.** Next.js 16 y AI SDK 7 cambian APIs respecto a versiones anteriores, así que antes de escribir leyó la documentación que viene dentro de `node_modules` (`next/dist/docs`, `ai/docs`): `proxy.ts` en lugar de `middleware.ts`, `generateText` con `Output.object`, Cache Components con `<Suspense>`.
3. **Infraestructura desde la terminal.** Creó el proyecto en Vercel con la CLI, aprovisionó Postgres desde el Marketplace (entonces Neon) y comprobó con una llamada real que AI Gateway pedía tarjeta antes de descartarlo.
4. **Verificación.** Typecheck, build de producción, tests unitarios del banco de pruebas y una ejecución completa en el navegador antes de dar nada por hecho.
5. **Depuración con datos, no con suposiciones.** En la primera ejecución real Develop no recibía respuesta. Claude Code midió cada modelo con peticiones cortas y largas y encontró tres causas distintas: los Flash-Lite devolvían 503 en las respuestas largas, los Flash tardaban más de 40 s por razonar y además tienen 20 peticiones al día. De ahí salieron la cadena de modelos, el razonamiento configurable por modelo y la pausa con reintento en lugar de dar la ejecución por fallida.
6. **Secretos.** Las claves se generaron y guardaron con `vercel env`, nunca en archivos versionados.

### Fase 2 — el equipo de agentes y la migración a Supabase

Al repasar el enunciado definitivo antes de entregar vi dos cosas que faltaban: los `.md` de los agentes y que la base de datos fuera Firebase o Supabase. Se hicieron las dos, y la segunda ya con el equipo:

1. **Se escribieron los tres `.md`:** [`CLAUDE.md`](CLAUDE.md) (Orquestador), [`develop.md`](.claude/agents/develop.md) y [`testing.md`](.claude/agents/testing.md) con sus 13 DIRECTRICES.
2. **El Orquestador planificó** la migración de Neon a Supabase como una tarea con 7 criterios de aceptación comprobables (driver, conexión perezosa, `prepare: false` para el pooler, RLS en las cinco tablas, documentación al día, los cuatro comandos en verde) y se quedó con lo que toca cuentas: crear el proyecto de Supabase desde el Marketplace de Vercel y conectar sus variables.
3. **Develop** (subagente lanzado desde la sesión del Orquestador con `develop.md` como instrucciones) cambió `@neondatabase/serverless` por `postgres` + `drizzle-orm/postgres-js`, activó RLS desde el esquema, cerró el pool en el script de siembra, añadió `tests/db.test.ts` y actualizó README y `.env.example`. Entregó con sus dudas por escrito: no había podido probar nada contra una base de datos real.
4. **Testing** (subagente de solo lectura, con `testing.md`) no se fio de la entrega: miró el `git diff`, ejecutó typecheck, tests, lint y build (este último sin variables de base de datos), generó el SQL con `drizzle-kit` para comprobar que emitía `ENABLE ROW LEVEL SECURITY` en las cinco tablas y recorrió todos los usos de `getDb()`. **Aprobó a la primera, sin fallos**, y devolvió cuatro puntos como «no verificado» y varias sugerencias.
5. **El Orquestador cerró lo no verificado** contra el Supabase real: `db:push`, siembra del usuario, RLS activa en las cinco tablas con cero políticas, la API anónima de Supabase devolviendo `[]` con datos dentro, y login correcto e incorrecto. De las sugerencias de Testing salieron tres cambios: este relato (el anterior decía «en una sola sesión»), el aviso de que Supabase pausa los proyectos gratuitos y una directriz D9 que aún nombraba la variable antigua.

En esta tarea no hubo rechazo: el ir y venir de fallos entre Develop y Testing se ve en la propia app, donde ocurre con frecuencia (por ejemplo, una tarea que falla 6 comprobaciones y se aprueba a la segunda entrega).

Mi papel fue dar el encargo, autorizar los pasos que requerían mi cuenta (términos de Neon y de Supabase, clave del proveedor de IA), revisar el resultado y decidir qué entregar.
