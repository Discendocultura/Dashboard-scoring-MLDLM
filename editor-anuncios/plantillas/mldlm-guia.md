# Guía de estilo · «El Camino» (Me lo dijo la matrona · Raíces)

Guía de marca de MLDLM tal como la definió la clienta. En los anuncios se aplica con `plantillas/mldlm.json`
(burdeos = `primario`, burdeos oscuro = `oscuro`, tierra = `acento`, crema = `claro`, el resto en `extra`).
Las reglas técnicas de GHL son para páginas web, no para vídeo, pero la paleta, la tipografía y la narrativa
visual sí valen para las animaciones.

Usa SIEMPRE esta paleta, tipografía y estilo de componentes en cualquier bloque/página de El Camino.

## Paleta (CSS variables)
```css
:root{
  --mldlm-burdeos:#860d0e;        /* acento principal: titulares destacados, números, etiquetas, botón principal */
  --mldlm-burdeos-osc:#5e0909;    /* relieve y hover del botón burdeos */
  --mldlm-tierra:#c49b79;         /* botón secundario, sendero punteado, flechas */
  --mldlm-tierra-osc:#a98262;     /* relieve del botón tierra, antetítulos suaves */
  --mldlm-tierra-claro:#e6d4c3;   /* trazo ancho del camino, separadores suaves */
  --mldlm-pastel:#f0e4da;         /* fondo de secciones, píldoras, cajas suaves */
  --mldlm-crema:#fbf6f1;          /* fondo general, tarjetas secundarias */
  --mldlm-blanco:#ffffff;         /* tarjetas principales */
  --mldlm-linea:#e2d3c5;          /* bordes y líneas finas */
  --mldlm-texto:#3a2a24;          /* texto de párrafo */
  --mldlm-titulos:#4a2c20;        /* titulares */
  --mldlm-suave:#6b5448;          /* texto apagado (notas) */
  --mldlm-mudo:#8a7468;           /* texto de estados bloqueados */
  /* Acentos puntuales */
  --mldlm-oro:#d9b47a;            /* entrada VIP */
  --mldlm-oro-claro:#f3e2bf;      /* entrada VIP */
  --mldlm-wa:#25D366;             /* WhatsApp */
  --mldlm-wa-osc:#1da851;         /* WhatsApp hover/relieve */
}
```

## Tipografía
- Familia única: **Lato** (Google Fonts), pesos 400 / 700 / 900 + cursiva 700/900.
```html
<link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,700;1,900&display=swap" rel="stylesheet">
```
- Titulares: Lato 900, color `--mldlm-titulos`, letter-spacing -0.01em. La parte destacada en *cursiva* y color `--mldlm-burdeos` (ej.: «Descubre *El Camino*…»).
- Antetítulos / etiquetas: Lato 900, MAYÚSCULAS, 12–13px, letter-spacing 0.12–0.2em, en burdeos o tierra.
- Texto: Lato 400, 16–18px, line-height 1.6, color `--mldlm-texto`. En inputs y textareas, mínimo 16px (evita el zoom en iPhone).
- Botones: Lato 900, MAYÚSCULAS, letter-spacing 0.02–0.04em.

## Componentes
- Tarjetas: fondo blanco, `border-radius:20px`, `border:1px solid #e2d3c5`, `box-shadow:0 14px 40px rgba(134,13,14,.10)`.
- Botón principal: fondo `#860d0e`, texto blanco, `border-radius:12px`, `box-shadow:0 5px 0 #5e0909, 0 12px 24px rgba(134,13,14,.28)`, brillo diagonal animado que lo recorre. Hover → `#5e0909`. Al pulsar baja 3px.
- Botón secundario: fondo `#c49b79`, texto `#3a2a24`, `box-shadow:0 5px 0 #a98262`. Hover → burdeos con texto blanco.
- Píldoras: fondo pastel `#f0e4da`, número en círculo burdeos con texto blanco.
- Estados de etapa: bloqueada (fondo crema, borde discontinuo, texto `#8a7468`, 🔒) · disponible (borde 2px burdeos, sombra marcada, etiqueta «● Toca ahora» que late) · hecha (borde tierra, ✓).
- Foco visible: `outline:3px solid #860d0e; outline-offset:3px`.

## Narrativa visual (Camino de Santiago)
- Sendero punteado animado que une secciones: trazo ancho `#e6d4c3` (12px) + puntos `#c49b79` (`stroke-dasharray:2 12`, animación de `stroke-dashoffset`).
- Concha de vieira como símbolo (SVG en línea, en burdeos o pastel).
- Mojones (piedra crema con placa burdeos y concha), numerados por etapa.
- La catedral de Santiago como meta (directo / final del recorrido).
- Peregrina caminando por el sendero (SVG + SMIL) en escenas de paisaje: colinas en tonos `#f2e6db`, `#ecdccd`, `#e2c9b2`, árboles en tierra.

## Reglas técnicas (GHL)
- Cada sección es un bloque independiente para un «Código personalizado»: sin `<html>`, `<head>` ni `<body>`. Cada bloque lleva su `<link>` de Lato y su `<style>`.
- Todas las clases con un prefijo propio (ej. `mldlm-…`), sin estilos globales.
- Móvil primero. En móvil, cada bloque ocupa el ancho completo:
  `@media(max-width:768px){.bloque{width:100vw!important;max-width:100vw!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important}}`
- `box-sizing:border-box` también en el contenedor raíz.
- Animaciones suaves y siempre `@media (prefers-reduced-motion:reduce)` para desactivarlas. Evita fundidos ligados al scroll que dejen texto a medio aparecer.
- No tocar los atributos `data-lsd-…` (los gestiona tracker.js) ni ponerles `display:none` en el CSS. Los enlaces `data-lsd-link` van sin `href`.
- Imágenes por URL (Medios de GHL), nunca en base64.
- Contraste AA y objetivos táctiles de 44px como mínimo.
