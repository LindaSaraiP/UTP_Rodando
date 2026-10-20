# Rodando UTP — versión final con Rodando Parking

Rodando UTP es una aplicación web progresiva (PWA) para movilidad colaborativa entre estudiantes de la Universidad Tecnológica de Puebla. Esta versión agrega dos funciones clave para que el proyecto no se vea tan parecido a propuestas básicas de carpool:

1. **Viaje con punto de conexión**: el conductor puede publicar una ruta directa o una ruta con hub de abordaje (por ejemplo, Parque Puebla o Solesta).
2. **Rodando Parking**: si la ruta fue marcada para parking y reúne al menos dos lugares reservados, el conductor puede generar un **pase colaborativo** desde su panel.

Además, se agregó un **perfil de administrador** con estadísticas y gestión de usuarios.

---

## Tecnologías

- HTML + CSS + JavaScript
- Node.js (sin dependencias externas)
- SQLite
- Service Worker + Manifest PWA

---

## Funciones reales incluidas

- Registro e inicio de sesión.
- Validación de correo institucional `@utpuebla.edu.mx`.
- Contraseñas con `scrypt` y salt aleatorio.
- Sesiones en SQLite.
- Protección CSRF.
- Rate limiting.
- Publicación de rutas.
- Búsqueda y filtrado de rutas.
- Reservación real de asientos.
- Cancelación de rutas y reservaciones.
- Panel del usuario con métricas EcoRodando.
- Generación de pase de Rodando Parking.
- Panel de administración para ver estadísticas y gestionar usuarios.

---

## Estructura principal

```text
RodandoUTP_EcoRodando_v4/
├── server.js
├── package.json
├── render.yaml
├── README.md
├── docs/
│   └── schema.sql
├── data/
└── public/
    ├── index.html
    ├── manifest.webmanifest
    ├── service-worker.js
    ├── css/
    │   └── styles.css
    ├── js/
    │   └── app.js
    ├── img/
    └── media/
```

---

## Ejecución local

```bash
npm start
```

Abre después:

```text
http://localhost:3000
```

También puedes usar:

```bash
npm run dev
```

---

## Credenciales del administrador

La cuenta de administrador se crea automáticamente al iniciar el proyecto si no existe.

- **Correo:** `admin@utpuebla.edu.mx`
- **Contraseña:** `RodandoParking2026`

Con esa cuenta puedes:
- ver estadísticas generales,
- revisar usuarios registrados,
- verificar usuarios,
- convertir usuarios en administradores,
- eliminar cuentas.

---

## Datos demo

Se generan automáticamente algunos usuarios y rutas de prueba para que la interfaz se vea completa desde el primer inicio.

Los usuarios demo usan esta contraseña:

```text
DemoSeguro2026
```

---

## PWA

La aplicación incluye:

- `manifest.webmanifest`
- Service Worker
- modo `standalone`
- iconos 192 y 512
- caché del app shell
- instalación desde navegador compatible

---

## Nota de publicación

GitHub Pages no sirve para esta versión funcional porque no ejecuta `server.js` ni SQLite. Para la entrega funcional completa se recomienda Render u otro hosting con Node.js.
# UTP_Rodando
