# API REST · ClariFin (gestión financiera personal)

Base: `http://localhost:4178/api`. Todas las respuestas son JSON. La colección [`ClariFin.postman_collection.json`](ClariFin.postman_collection.json) ejecuta en orden todas las solicitudes de este documento con sus pruebas.

## Convenciones

| Aspecto | Regla |
| --- | --- |
| Sesión | Cookie `gf_session` (HttpOnly, SameSite=Strict, 7 días) que se obtiene en `POST /auth/login`. |
| CSRF | Toda solicitud distinta de GET lleva `X-CSRF-Token` con el valor `csrf` que devuelve el login. |
| Idempotencia | Las operaciones de escritura sobre datos financieros llevan `Idempotency-Key` (12 a 80 caracteres: letras, números, `_` o `-`). Repetir la misma clave con el mismo cuerpo devuelve el resultado original sin duplicar; con otro cuerpo responde 409 `KEY_CONFLICT`. |
| Cuerpo | `Content-Type: application/json` en POST, PUT y PATCH. DELETE no lleva cuerpo. |
| Importes | Texto con pesos y hasta dos decimales, sin separadores de miles: `"45000"`, `"1250.50"`. |
| Fechas | `AAAA-MM-DD`, calendario de Bogotá. Las fechas de movimientos no pueden ser futuras. |
| Éxito | `{ "data": … }` |
| Error | `{ "error": { "code", "message", "details" }, "requestId" }` |

## Endpoints

### Autenticación y perfil

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| POST | `/auth/register` | Crea un perfil `{ name, email, password (≥10) }` con 10 categorías predeterminadas | 201 |
| POST | `/auth/login` | Inicia sesión `{ email, password }`; devuelve el usuario y `csrf` | 200 |
| POST | `/auth/logout` | Cierra la sesión y desconecta el chat | 200 |
| GET | `/users/me` | Perfil de la sesión | 200 |
| PATCH | `/users/me` | Actualiza `{ name, email }` | 200 |

### Cuentas

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/accounts` | Cuentas con su saldo actual | 200 |
| POST | `/accounts` | Crea `{ name, openingBalance, date }`; el saldo inicial no puede ser negativo | 201 |
| PATCH | `/accounts/:id` | Renombra o activa/desactiva `{ name?, active? }` | 200 |
| DELETE | `/accounts/:id` | Elimina una cuenta sin historial (solo su saldo de apertura); si tiene movimientos responde 409 `IN_USE` | 200 |
| POST | `/accounts/:id/adjustments` | Ajuste de saldo `{ amount (+/−), description, date }` | 201 |

### Categorías

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/categories` | Categorías de ingreso y gasto | 200 |
| POST | `/categories` | Crea `{ name, type: "income" \| "expense" }` | 201 |
| PATCH | `/categories/:id` | Renombra o activa/desactiva | 200 |
| DELETE | `/categories/:id` | Elimina una categoría que ningún movimiento, presupuesto ni compromiso usa; si no, 409 `IN_USE` | 200 |

### Movimientos y transferencias

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/transactions` | Historial paginado. Filtros: `from`, `to`, `type`, `accountId`, `categoryId`, `page`, `size` (máx. 100) | 200 |
| GET | `/transactions/:id` | Detalle con su auditoría | 200 |
| POST | `/transactions` | Registra `{ type, accountId, categoryId, amount, date, description? }` | 201 |
| PUT | `/transactions/:id` | Corrige un ingreso o gasto; exige `version` vigente | 200 |
| POST | `/transactions/:id/void` | Anula `{ version }` y revierte su efecto | 200 |
| POST | `/transfers` | Traslado `{ sourceAccountId, destinationAccountId, amount, date, description? }` | 201 |
| POST | `/transfers/:id/void` | Anula una transferencia `{ version }` | 200 |

Las anulaciones son borrado lógico: el registro se conserva marcado como anulado y la auditoría guarda cada versión.

### Presupuestos y alertas

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/budgets` | Presupuestos con consumo, disponible y porcentaje | 200 |
| POST | `/budgets` | Crea `{ categoryId, period: "AAAA-MM", limitAmount }` (uno por categoría y mes) | 201 |
| PATCH | `/budgets/:id` | Cambia `{ limitAmount }` | 200 |
| DELETE | `/budgets/:id` | Elimina el presupuesto y sus avisos de umbral | 200 |
| GET | `/alerts` | Avisos de 80 % y 100 % y recordatorios de compromisos a 3 días o menos | 200 |

### Compromisos recurrentes

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/recurring-schedules` | Programaciones mensuales | 200 |
| POST | `/recurring-schedules` | Crea `{ name, categoryId, estimatedAmount, dueDay (1-31), startDate, isVariable }` y genera los compromisos de los meses transcurridos | 201 |
| PATCH | `/recurring-schedules/:id` | Edita o activa/desactiva hacia el futuro | 200 |
| GET | `/commitments` | Compromisos con pagado, pendiente, estado y días de atraso. Filtros: `period`, `status` | 200 |
| GET | `/commitments/:id` | Detalle con abonos y auditoría | 200 |
| PATCH | `/commitments/:id/amount` | Ajusta el importe de un compromiso variable antes del primer abono | 200 |
| POST | `/commitments/:id/payments` | Registra un abono `{ accountId, amount, date, description? }` sin superar lo pendiente | 201 |
| PUT | `/payments/:id` | Corrige un abono `{ accountId, amount, date, description?, version }` | 200 |
| POST | `/payments/:id/void` | Anula un abono `{ version }` | 200 |

### Reportes

| Método | Ruta | Descripción | Éxito |
| --- | --- | --- | --- |
| GET | `/reports` | Totales, flujos por categoría y por mes, y saldos al corte. Filtros: `from`, `to`, `accountId`, `categoryId` | 200 |

### Chat (Socket.IO)

Fuera de REST, el evento `chat:interpret { requestId, text }` responde `chat:proposal` con un movimiento sugerido (tipo, importe, cuenta, categoría y fecha) o `chat:error`. No guarda nada: la persona revisa la propuesta y la registra con `POST /transactions`. Requiere la cookie de sesión y el token CSRF en `auth.csrf`.

## Regla de saldo

Ninguna operación puede dejar una cuenta por debajo de cero: gastos, abonos, transferencias, ajustes negativos y anulaciones de ingresos. Llevar la cuenta exactamente a cero sí es válido. Si una cuenta ya tenía saldo negativo por datos anteriores, se permiten las operaciones que no lo empeoran.

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Saldo insuficiente en «Nequi»: disponible $ 75.000, la operación necesita $ 90.000.",
    "details": {
      "accountId": 2,
      "accountName": "Nequi",
      "currentBalance": "75000.00",
      "resultingBalance": "-15000.00"
    }
  }
}
```

## Códigos de respuesta

| HTTP | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION` | Campos inválidos; `details` lista cada campo y su motivo |
| 400 | `KEY` / `DATE_RANGE` / `BODY` | Falta `Idempotency-Key`, rango de fechas invertido o JSON mal formado |
| 401 | `SESSION` / `CREDENTIALS` | Sin sesión, o correo/contraseña incorrectos |
| 403 | `CSRF` / `ORIGIN` | Token CSRF ausente o distinto, u origen no autorizado |
| 404 | `NOT_FOUND` | El registro no existe o pertenece a otro perfil |
| 409 | `DUPLICATE` | Ya existe (correo, nombre de cuenta, presupuesto del mes…) |
| 409 | `STALE` | La `version` enviada ya no es la vigente |
| 409 | `IN_USE` | Se intenta eliminar una cuenta o categoría con historial |
| 409 | `KEY_CONFLICT` | La clave de idempotencia ya se usó con otro cuerpo |
| 415 | `JSON` | Escritura sin `Content-Type: application/json` |
| 422 | `INSUFFICIENT_FUNDS` | La operación dejaría una cuenta en negativo |
| 422 | `NEGATIVE_OPENING` | Saldo inicial negativo |
| 422 | `INACTIVE` / `CATEGORY_TYPE` / `SAME_ACCOUNT` | Cuenta o categoría inactiva, categoría de otro tipo, transferencia a la misma cuenta |
| 422 | `OVERPAY` / `AMOUNT_LOCKED` / `WRONG_FLOW` | Abono mayor a lo pendiente, importe de compromiso ya con abonos, ruta que no corresponde al tipo de registro |
| 429 | `RATE_LIMIT` | Demasiados intentos de acceso |
| 500 | `INTERNAL` | Error no previsto (se registra con su `requestId`) |
| 503 | `ECONNREFUSED` / `ETIMEDOUT` | Base de datos temporalmente no disponible |
