<div align="center">

# ✨ Eurovic

### Clean Girl Expense Tracker

<p>Control de gastos personal, bonito y asistido por IA.</p>

<p>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Deploy en Vercel"></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"></a>
  <a href="https://console.groq.com/"><img src="https://img.shields.io/badge/AI-Groq-F55036?style=for-the-badge" alt="Groq"></a>
</p>

</div>

> 🧾 Convierte notificaciones bancarias en gastos organizados y consulta tus hábitos de consumo en un dashboard mensual.

Aplicación personal de control de gastos con captura de transacciones **asistida por IA**. Una notificación bancaria en texto libre (por ejemplo, la de un cargo con tarjeta) se envía a un *webhook*, un modelo de lenguaje la interpreta y estructura, y el gasto queda guardado y visible al instante en un dashboard con estadísticas mensuales. Desplegada como funciones serverless de **Vercel** con **Supabase (PostgreSQL)** como base de datos.

---

## 🧭 Índice

- [Características principales](#1-características-principales)
- [Tecnologías utilizadas](#2-tecnologías-utilizadas)
- [Estructura del proyecto](#3-estructura-del-proyecto)
- [Instalación y ejecución](#4-requisitos-previos-e-instalación)
- [Variables de entorno](#5-variables-de-entorno)
- [Endpoints API](#6-ejemplo-de-uso--endpoints-api)
- [Limitaciones conocidas](#7-limitaciones-conocidas)

---

## 1. Características principales

- **Registro de gastos por IA**: envía el texto de una notificación bancaria a `/api/webhook` y un LLM extrae comercio, importe y categoría automáticamente — pensado para integrarse con atajos del móvil (Atajos de iOS, Tasker, etc.) que capturan notificaciones.
- **Clasificación automática en 10 categorías** con emoji propio (Shopping, Self Care, Brunch & Desayunos, Cenas & Copas, Fiesta & Eventos, Ocio, Supermercado, Escapadas, Movilidad, Varios).
- **Alta manual de gastos** desde la interfaz, sin pasar por la IA.
- **Dashboard mensual**: total gastado, comparativa frente al mes anterior, mayor capricho, categoría top y ticket medio.
- **Historial filtrable**: búsqueda por texto y filtro por categoría, con borrado individual o de un mes completo.
- **Frontend ligero de una sola página**: HTML + JavaScript vanilla, sin *build step*, con Tailwind CSS vía CDN — desplegable como archivo estático.
- **Diseño mobile-first** ("clean girl aesthetic"), pensado para instalarse como app de pantalla de inicio en iOS (`apple-mobile-web-app-capable`).

<p align="center">
  <img src="https://img.shields.io/badge/Vanilla%20JS-ES2020%2B-F7DF1E?style=flat-square&logo=javascript&logoColor=111111" alt="Vanilla JavaScript">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 18 o superior">
  <img src="https://img.shields.io/badge/Mobile--first-💖-ff69b4?style=flat-square" alt="Mobile first">
</p>

---

## 2. Tecnologías utilizadas

| Capa | Tecnología |
| :--- | :--- |
| Frontend | HTML5 + **JavaScript vanilla** (ES2020+, sin framework) · **Tailwind CSS** (CDN, sin build) · Google Fonts |
| Backend | **Funciones serverless de Vercel** (Node.js, módulos ES `import`/`export`) |
| Base de datos | **Supabase** (PostgreSQL gestionado) vía `@supabase/supabase-js` |
| IA — extracción de gastos | **Groq API**, modelo `openai/gpt-oss-120b` |
| Hosting / despliegue | **Vercel** (frontend estático + funciones API) |

---

## 3. Estructura del proyecto

```text
EuroVic/
├── api/                    # Funciones serverless (Vercel Functions)
│   ├── gastos.js           # CRUD de gastos: GET / POST / DELETE
│   └── webhook.js          # Punto de entrada por IA (Groq): texto -> gasto guardado
│
├── public/
│   └── index.html           # SPA de una sola página (UI + lógica de cliente)
│
├── package.json
└── package-lock.json
```

> No hay carpeta `src/` ni bundler: `public/index.html` es servido directamente como archivo estático por Vercel, y `api/*.js` se despliega automáticamente como una función serverless por archivo (convención de [Vercel Functions](https://vercel.com/docs/functions)).

---

## 4. Requisitos previos e instalación

### Requisitos

| Componente | Notas |
| :--- | :--- |
| **Node.js** 18 o superior | Necesario para las funciones serverless (`fetch` nativo) |
| **Cuenta de Vercel** | Para desplegar el frontend y las funciones API |
| **Proyecto de Supabase** | Base de datos PostgreSQL con la tabla `gastos` (ver más abajo) |
| **API key de Groq** | Motor de IA usado por `/api/webhook` (obtenerla en [console.groq.com](https://console.groq.com)) |
| **Vercel CLI** | Para ejecutar el proyecto en local con soporte de funciones serverless (`npm i -g vercel`) |

### Esquema de base de datos

La tabla `gastos` en Supabase debe tener, como mínimo, estas columnas:

| Columna | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `int8` / `uuid` | Clave primaria |
| `comercio` | `text` | |
| `monto` | `numeric` / `float8` | |
| `categoria` | `text` | Una de las 10 categorías soportadas |
| `emoji` | `text` | |
| `fecha` | `timestamptz` | Usada para filtrar por mes |

### Instalación y ejecución en local

```bash
# 1. Clonar el repositorio
git clone https://github.com/victorzurd/EuroVic.git
cd EuroVic

# 2. Instalar dependencias
npm install

# 3. Instalar la Vercel CLI (si no la tienes) y vincular el proyecto
npm install -g vercel
vercel login
vercel link

# 4. Configurar las variables de entorno (ver sección 5)
vercel env pull .env.local

# 5. Levantar frontend + funciones API en local
vercel dev
```

Por defecto, `vercel dev` sirve la aplicación en `http://localhost:3000`.

> El proyecto no incluye un servidor Express ni script `npm start`: **las funciones de `api/` solo se ejecutan con la Vercel CLI** (`vercel dev`) o una vez desplegadas en Vercel; abrir `public/index.html` directamente en el navegador no proporcionará las rutas `/api/*`.

### Despliegue en producción

```bash
vercel --prod
```

Configura las variables de entorno de la sección 5 en **Vercel → Project Settings → Environment Variables** antes de desplegar.

---

## 5. Variables de entorno

No se incluye ningún fichero `.env` ni `.env.example` en el repositorio. Estas son las variables que consume el código y deben configurarse en Vercel (o en `.env.local` para desarrollo con `vercel dev`):

| Variable | Usada en | Obligatoria | Descripción |
| :--- | :--- | :--- | :--- |
| `POSTGRES_SUPABASE_URL` | `api/gastos.js`, `api/webhook.js` | Sí | URL del proyecto de Supabase. |
| `POSTGRES_SUPABASE_SERVICE_ROLE_KEY` | `api/gastos.js`, `api/webhook.js` | Sí | Clave `service_role` de Supabase (con permisos de escritura completos; **no** la clave pública `anon`). |
| `GROQ_API_KEY` | `api/webhook.js` | Sí, para el flujo de captura por IA | Clave de la API de Groq usada para interpretar el texto de la notificación. |

```bash
# .env.local (uso con `vercel dev`)
POSTGRES_SUPABASE_URL=https://xxxxxxxx.supabase.co
POSTGRES_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
GROQ_API_KEY=gsk_...
```

---

## 6. Ejemplo de uso / endpoints API

Todos los endpoints devuelven JSON y tienen CORS abierto (`Access-Control-Allow-Origin: *`).

### 6.1. `GET /api/gastos` — listar gastos

| Parámetro (query) | Descripción |
| :--- | :--- |
| `month` | Filtra por mes en formato `YYYY-MM`. |
| `limit` | Límite de resultados (ignorado si se pasa `month`). Por defecto: `200`. |

```bash
curl "http://localhost:3000/api/gastos?month=2026-09"
```

```json
[
  {
    "id": 42,
    "comercio": "Mercadona",
    "monto": 34.5,
    "categoria": "Supermercado",
    "emoji": "🛒",
    "fecha": "2026-09-20T18:32:00.000Z"
  }
]
```

### 6.2. `POST /api/gastos` — crear gasto manual

```bash
curl -X POST http://localhost:3000/api/gastos \
  -H "Content-Type: application/json" \
  -d '{"comercio": "Zara", "monto": 59.90, "categoria": "Shopping"}'
```

| Campo | Obligatorio | Valor por defecto |
| :--- | :--- | :--- |
| `comercio` | Sí | — |
| `monto` | Sí (numérico) | — |
| `categoria` | No | `Varios` |
| `emoji` | No | `✨` |
| `fecha` | No | Fecha/hora actual (ISO 8601) |

### 6.3. `DELETE /api/gastos` — borrar gasto(s)

```bash
# Borrar un gasto concreto
curl -X DELETE "http://localhost:3000/api/gastos?id=42"

# Borrar todos los gastos de un mes
curl -X DELETE "http://localhost:3000/api/gastos?month=2026-09"
```

### 6.4. `POST /api/webhook` — capturar gasto desde texto libre (IA)

Punto de entrada pensado para atajos automatizados: recibe el texto de una notificación bancaria, lo interpreta con **Groq (Llama 3 / `gpt-oss-120b`)** y guarda el gasto directamente en Supabase.

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"text": "Has pagado 18,90 EUR en STARBUCKS MADRID con tu tarjeta"}'
```

```json
{
  "success": true,
  "mensaje": "🥐 Starbucks: -18.90€ (Brunch & Desayunos)",
  "gasto": {
    "id": 43,
    "comercio": "Starbucks",
    "monto": 18.9,
    "categoria": "Brunch & Desayunos",
    "emoji": "🥐",
    "fecha": "2026-09-25T10:15:00.000Z"
  }
}
```

El texto puede llegar en cualquiera de estos campos del cuerpo: `text`, `notificacion`, `message` o `contenido` (o como parámetro `?text=` en la URL).

---

## 7. Limitaciones conocidas

> ⚠️ **Importante:** los endpoints son públicos por defecto. Revisa las limitaciones de seguridad antes de usar la aplicación con datos reales.

Aspectos detectados durante el análisis estático del código:

- **Sin capa de autenticación**: los dos endpoints (`gastos` y `webhook`) son públicos y aceptan peticiones de cualquier origen (`Access-Control-Allow-Origin: *`); cualquiera con la URL puede leer, crear o borrar gastos.
- **Uso de la clave `service_role` de Supabase**: al ejecutarse en funciones serverless (no en el navegador) esto es razonable, pero un error de configuración que exponga esta clave comprometería el acceso total a la base de datos, saltándose cualquier política de *Row Level Security*.
- **Sin validación de webhook**: `/api/webhook` no verifica ninguna firma ni token, por lo que un tercero que descubra la URL puede insertar gastos falsos.
- **Frontend sin *build ni framework***: `public/index.html` concentra HTML, CSS (vía Tailwind CDN) y toda la lógica de la SPA en un único archivo de más de 700 líneas; no hay componentización ni *tests*.
- **Dependencia de un servicio externo de pago**: la captura de gastos por IA requiere cuota disponible en Groq; sin `GROQ_API_KEY` configurada, `/api/webhook` responde con error 500.
- **Sin `vercel.json`**: la configuración de rutas y funciones se apoya íntegramente en las convenciones automáticas de Vercel; cualquier necesidad de configuración avanzada (cron jobs, *rewrites*, límites de duración) requeriría añadirlo.
