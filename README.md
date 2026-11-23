# Gestión financiera personal (ClariFin)

Aplicación web en español para llevar las finanzas personales en pesos colombianos: cuentas, ingresos y gastos, transferencias, presupuestos mensuales por categoría con alertas, compromisos de pago recurrentes con abonos, reportes y un chat que convierte frases como «me gasté 15 mil en transporte» en un movimiento editable. Ninguna cuenta puede quedar con saldo negativo.

**Problemática:** quien maneja efectivo y billeteras digitales suele llevar sus gastos entre notas, hojas de cálculo y memoria, sin saber cuánto queda en cada cuenta ni qué pagos siguen pendientes. La aplicación centraliza ese registro.

Parcial práctico integrador «Del problema a la solución» · Electiva de Profundización III – Desarrollo Web Back-End · Tecnología en Desarrollo de Software, semestre VII · Institución Universitaria de San Andrés, Providencia y Santa Catalina (IUSAI) · Docente: Dwith Newball de Ávila.

**Integrantes:** Michael Steven Ortiz Pedreros, Josua Isaac Guerrero Pastrana y Valeria Isabel Rico Romero.

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| API REST | Node.js 22.12+, Express 5, Zod (validación), Helmet, express-rate-limit |
| Autenticación | Argon2id, sesión con cookie HttpOnly, token CSRF |
| Base de datos | MySQL 8.4 (InnoDB) con mysql2/promise |
| Tiempo real | Socket.IO (chat de movimientos) |
| Interfaz | React 19 + Vite |
| Pruebas | node:test, Playwright (navegador), colección de Postman |
| Contenedores | Docker y Docker Compose |

## Inicio rápido

Requisitos: Windows 10 u 11, conexión a Internet la primera vez y [Node.js 22.12 o posterior](https://nodejs.org) (versión LTS).

1. Descarga el proyecto: en GitHub, **Code → Download ZIP**, y extráelo en una carpeta (o usa `git clone`).
2. Abre la carpeta y haz doble clic en **Iniciar.cmd**. Se abre una ventana de consola: déjala abierta mientras uses la aplicación.
3. La primera vez tarda unos minutos (instala dependencias y descarga MySQL). Cuando diga «Lista en http://localhost:4178», el navegador se abre solo.
4. Pulsa **Crear un perfil nuevo**, regístrate y crea tu primera cuenta en **Cuentas**.

Para cerrar: cierra la ventana de consola (o pulsa Ctrl+C) para detener el servidor, o ejecuta **Detener.cmd** para apagar también MySQL. También puedes usar `npm run iniciar` y `npm run detener` desde una terminal.

El asistente hace todo por ti: crea la configuración (`.env`), instala las dependencias, prepara la base de datos, compila la interfaz solo cuando cambió el código, inicia el servidor y abre **http://localhost:4178** en el navegador. Si la aplicación ya estaba abierta, simplemente te lleva a ella.

La carpeta `node_modules` no hace falta traerla: se instala sola la primera vez. La base de datos también: descarga un MySQL portátil (≈250 MB, solo la primera vez) y lo guarda en `%LOCALAPPDATA%\IUSAI-GestionFinanciera`.

Al detener, tus datos se conservan. Para borrar la base de datos local y empezar de cero (por ejemplo, si aparece «la base de datos local ya existe, pero fue creada con otras contraseñas»), ejecuta **Reiniciar-datos.cmd** y luego **Iniciar.cmd**; no vuelve a descargar MySQL. Las credenciales quedan guardadas junto a los datos en `%LOCALAPPDATA%\IUSAI-GestionFinanciera`, así que puedes mover o volver a descargar el proyecto sin perder el acceso. Conserva el archivo `.env` y la carpeta de datos al trasladar la instalación. Para cerrar solo el servidor, cierra la ventana o pulsa Ctrl+C.

Cada perfil recibe diez categorías editables.

## Ejecutar con Docker Compose

Con Docker Engine y Compose v2 no se necesita nada más (ni siquiera `.env`):

```sh
docker compose up --build
```

Abre http://localhost:4178. Compose construye React y Express, inicia MySQL 8.4 y aplica el esquema al iniciar la aplicación. El volumen `datos` conserva la información entre reinicios. `docker compose stop` detiene ambos servicios. Si el puerto está ocupado, define otro valor de PORT. El puerto SQL del contenedor solo es accesible en la red interna. Las contraseñas por defecto son para uso local; defínelas en `.env` (DB_PASSWORD, MYSQL_ROOT_PASSWORD) si vas a exponer el servicio. El ejemplo está configurado para HTTP local. Para HTTPS se configura COOKIE_SECURE y el origen exacto en el servidor.

## Usar una instancia de MySQL existente

Crea un esquema con UTF-8 y un usuario limitado a ese esquema. En `.env` indica host, puerto, esquema, usuario y contraseña (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD). No compartas `.env`. Después ejecuta `npm run iniciar`, o manualmente:

```sh
npm ci
npm run migrate
npm run build
npm start
```

La migración adquiere un bloqueo por esquema, crea las tablas faltantes y actualiza las vistas sin eliminar datos. Todas las tablas utilizan InnoDB. MySQL 8.4 es el motor probado. El inicio de sesión, el arranque del servidor y la tarea horaria recuperan compromisos según el calendario de Bogotá. No se necesita configurar un cron externo.

## Probar la API con Postman

Importa `docs/ClariFin.postman_collection.json` en Postman (**Import**), abre la aplicación y ejecuta la colección completa con **Run collection**. Recorre 39 solicitudes en orden: registro e inicio de sesión, cuentas, categorías, movimientos (GET, POST, PUT, PATCH y anulación), transferencias, presupuestos, compromisos, reportes, eliminaciones (DELETE) y los errores esperados (400, 401, 404, 409 y 422). Cada solicitud verifica su código de respuesta. Cada ejecución crea un perfil nuevo, así que puede repetirse.

La referencia completa de endpoints, encabezados y códigos de error está en [docs/API.md](docs/API.md).

## Pruebas

Con las dependencias instaladas y MySQL accesible, ejecuta:

```sh
npm test
npm run build
npm run test:ui
```

La base predeterminada es `gestion_financiera_test`. En una instalación manual, créala y concede acceso al usuario de prueba. También se admite TEST_DB_NAME con sufijo _test. Cada ejecución crea perfiles ficticios con identificadores únicos y deja sus datos en ese esquema. Las pruebas de navegador usan Chrome o Edge instalados, o el ejecutable definido en BROWSER_PATH. Arrancan un servidor local temporal y guardan las capturas y un reporte JSON en la carpeta hermana `Entrega académica/evidencias` (se crea si no existe). La variable EVIDENCE_DIR permite elegir otro destino. El dictado con micrófono requiere un navegador compatible y permiso de la persona.

## Estructura

| Ruta | Contenido |
| --- | --- |
| backend/src | Express, autenticación, repositorio, servicios, chat y servidor HTTP |
| backend/tests | Pruebas de dominio, integración HTTP y navegación automatizada |
| frontend/src | Pantallas React, formularios y clientes REST y Socket.IO |
| database | DDL reproducible, vistas y migrador |
| docs | Referencia de la API (`API.md`) y colección de Postman |
| scripts | `iniciar.js` y `detener.js` (arranque en un paso) y el asistente de MySQL para Windows |

## Reglas para interpretar los resultados

**Ninguna cuenta puede quedar con saldo negativo.** Un gasto, un abono, una transferencia, un ajuste negativo o la anulación de un ingreso que dejen una cuenta por debajo de cero se rechazan con el código `INSUFFICIENT_FUNDS` (HTTP 422) y un mensaje que indica el saldo disponible. Llevar una cuenta exactamente a cero es válido. El saldo inicial tampoco puede ser negativo (`NEGATIVE_OPENING`). Los formularios muestran el saldo disponible y bloquean el envío antes de llamar al servidor, que sigue siendo quien decide. Ya no existe el flujo de confirmación de saldos (`BALANCE_CONFIRMATION_REQUIRED`) ni la variable CONFIRMATION_SECRET.

Las cuentas y categorías sin historial y los presupuestos pueden eliminarse (DELETE). Lo que tiene historial no se borra: se desactiva o se anula, y responde 409 `IN_USE` si se intenta eliminar.

Un traslado genera dos apuntes de saldo y queda fuera de los flujos de ingreso y gasto. Un abono es un gasto con referencia al compromiso. Las consultas de presupuesto, remanente y saldo se derivan del libro vigente. Las anulaciones y correcciones conservan la versión anterior en auditoría. Los avisos de presupuesto tienen clave única por umbral. Si el consumo baja, el aviso histórico permanece identificado como tal.

La API completa, los contratos y los códigos de respuesta se encuentran en [docs/API.md](docs/API.md).
