/**
 * «Esta web»: el proyecto de partida sobre el que trabajan los agentes.
 * Cada petición recibe una copia en la tabla `files` (espacio de trabajo virtual).
 */
export const BASE_SITE: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Obradoiro Lúa — Cerámica artesanal</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html">Obradoiro Lúa</a>
    <nav class="site-nav" aria-label="Principal">
      <a href="index.html" aria-current="page">Inicio</a>
      <a href="index.html#talleres">Talleres</a>
      <a href="index.html#sobre">Sobre nosotras</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Cerámica hecha a mano en la Costa da Morte</h1>
      <p>Piezas únicas de gres y talleres para aprender a tornear desde cero.</p>
      <a class="button" href="index.html#talleres">Ver talleres</a>
    </section>

    <section id="talleres" class="section">
      <h2>Talleres</h2>
      <div class="cards">
        <article class="card">
          <h3>Iniciación al torno</h3>
          <p>Cuatro sesiones para centrar, abrir y levantar tu primera pieza.</p>
          <p class="price">120 €</p>
        </article>
        <article class="card">
          <h3>Esmaltes</h3>
          <p>Aprende a preparar y aplicar esmaltes de alta temperatura.</p>
          <p class="price">90 €</p>
        </article>
        <article class="card">
          <h3>Taller en familia</h3>
          <p>Una mañana de modelado a mano para peques y mayores.</p>
          <p class="price">35 €</p>
        </article>
      </div>
    </section>

    <section id="sobre" class="section">
      <h2>Sobre nosotras</h2>
      <p>Somos Uxía y Antía. Abrimos el obradoiro en 2019 en Baio y desde entonces
      hemos formado a más de 400 personas.</p>
    </section>
  </main>

  <footer class="site-footer">
    <p>© 2026 Obradoiro Lúa · Baio, A Coruña</p>
  </footer>
</body>
</html>
`,
  "styles.css": `:root {
  --bg: #faf7f2;
  --ink: #2b2420;
  --muted: #6f635b;
  --accent: #b4532a;
  --accent-ink: #ffffff;
  --card: #ffffff;
  --line: #e7dfd5;
  --radius: 12px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
  color: var(--ink);
  background: var(--bg);
}

.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--card);
}

.brand {
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--ink);
  text-decoration: none;
}

.site-nav { display: flex; flex-wrap: wrap; gap: 20px; }
.site-nav a { color: var(--muted); text-decoration: none; }
.site-nav a:hover,
.site-nav a[aria-current="page"] { color: var(--accent); }

main { max-width: 960px; margin: 0 auto; padding: 0 24px; }

.hero { padding: 72px 0 48px; }
.hero h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.15; margin: 0 0 16px; }
.hero p { color: var(--muted); font-size: 1.1rem; max-width: 56ch; }

.button {
  display: inline-block;
  margin-top: 16px;
  padding: 12px 22px;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.button:hover { filter: brightness(1.08); }

.section { padding: 40px 0; border-top: 1px solid var(--line); }
.section h2 { margin-top: 0; }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.card {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
}
.card h3 { margin: 0 0 8px; }
.price { font-weight: 700; color: var(--accent); margin-bottom: 0; }

.site-footer {
  margin-top: 48px;
  padding: 24px;
  text-align: center;
  color: var(--muted);
  border-top: 1px solid var(--line);
}
`,
};

export const EXAMPLE_PROMPTS = [
  "Añade una página de contacto a esta web",
  "Añade una sección de preguntas frecuentes en la página de inicio",
  "Añade una página con el calendario de talleres de diciembre",
  "Añade un botón para cambiar entre modo claro y oscuro",
];
