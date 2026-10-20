# Cumplimiento de requisitos — Rodando UTP

## 1. Tema relacionado con innovación, creatividad o emprendimiento
**Cumple.** Rodando UTP es una propuesta de movilidad colaborativa para estudiantes. La página explica problema, solución, propuesta de valor y funcionamiento.

## 2. Maquetado de la página
**Cumple.** `public/index.html` contiene:
- Header e identidad del proyecto.
- Menú de navegación.
- Cuerpo dividido en secciones.
- Footer completo.

## 3. Diseño responsivo
**Cumple.** `public/css/styles.css` incluye adaptaciones en 1180 px, 920 px, 720 px y 520 px para escritorio, laptop, tableta y celular.

## 4. Colores consistentes
**Cumple.** Paleta definida mediante variables CSS en `:root`, basada en fondos oscuros y verdes esmeralda.

## 5. Multimedia
**Cumple.** Incluye:
- Texto.
- Imágenes SVG locales en `public/img/`.
- Video MP4 local en `public/media/rodando-utp-presentacion.mp4`.

## 6. Tipografía, legibilidad, ortografía y redacción
**Cumple.** Se usa tipografía de sistema, contraste alto, títulos fluidos y textos redactados en español.

## 7. Código organizado
**Cumple.** Separación entre:
- HTML: `public/index.html`
- CSS: `public/css/styles.css`
- JavaScript: `public/js/app.js`
- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/service-worker.js`
- Backend: `server.js`
- Base de datos: SQLite, creada automáticamente.

## Requisitos PWA adicionales
- Manifest.
- Service Worker.
- Iconos 192x192 y 512x512.
- Modo standalone.
- App shell offline.
- Botón de instalación.
- Indicador online/offline.
- Shortcuts.
- Tema y color de fondo.

## URL de publicación
La URL definitiva debe generarse al desplegar el proyecto en un hosting Node con HTTPS. La aplicación muestra automáticamente su URL real en la sección **Publicación**.
