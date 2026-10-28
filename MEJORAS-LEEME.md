# Mis finanzas — mejoras v3

Esta versión continúa sobre la PWA anterior y conserva el almacenamiento local, la estructura de datos y la sincronización con Supabase. `config.js` mantiene los marcadores de posición; no contiene tus credenciales.

## Incluido en esta entrega

- Edición de movimientos, búsqueda/filtros, exportación CSV y evolución de seis meses.
- Chat con importes coloquiales, fechas naturales, cuotas ya soportadas por la app y confirmación antes de registrar.
- Chat: búsqueda de movimientos por descripción para editar; borrado por descripción o último movimiento, con confirmación. Si la compra está agrupada en cuotas, el borrado desde el chat solicita borrar el grupo completo.
- Chat: detección de varios movimientos con verbos repetidos y casos habituales unidos por “y” con un segundo importe; muestra vista previa y confirma antes de guardar. Revisá siempre la vista previa: el lenguaje natural no es infalible.
- Moneda por movimiento (ARS, USD, EUR, BRL, CLP y códigos ISO de tres letras que se agreguen), filtros por moneda y resumen/gráficos separados por moneda para evitar sumar monedas distintas. Los movimientos anteriores se interpretan como ARS.
- El chat reconoce menciones explícitas de dólares, euros y reales brasileños. Las compras con tarjeta se mantienen en ARS para no mezclar importes en los resúmenes de tarjetas.
- Exportación CSV añade una columna `Moneda`; el resto de las columnas conserva fecha, descripción, importe, medio de pago, tipo y estado.
- Cuentas/billeteras y transferencias entre cuentas; ahora permite distinta moneda si se ingresa manualmente el tipo de cambio, muestra ambas cantidades y guarda el tipo utilizado.
- Renombrado de categorías, presupuestos por tarjeta, gastos fijos variables y carga retroactiva rápida, bloqueo local por PIN.
- Se conservan los datos JSON en Supabase, por lo que no se requiere modificar la tabla `datos` para estos campos nuevos.

## Nuevas mejoras de rendimientos en esta versión

- Horario de notificaciones actualizado a las 18:00 de Argentina: el cron debe quedar a las 21:00 UTC; se incluye SQL para actualizar el trabajo existente sin duplicarlo.
- Límites configurables por billetera: ingresos diarios/mensuales y transferencias salientes diarias/mensuales. El uso se calcula automáticamente desde transferencias reales registradas; se pueden editar transferencias para corregir fecha, importe o anularlas.
- Registro de transferencias de una billetera a otra, con origen/destino y fecha, para alimentar el cálculo de límites. Solo las operaciones realizadas consumen límite.
- Corrección histórica del rendimiento por fecha y billetera: marcar transferencia omitida, rendimiento cero o introducir el rendimiento correcto.
- Tasas con fecha efectiva: los cambios se guardan como historial y se aplica la tasa vigente en cada fecha, sin recalcular fechas anteriores con la nueva tasa.
- Capturas históricas congeladas de rendimientos hasta una fecha, con saldo, rendimiento acumulado, detalle diario y tasas por billetera. Las capturas existentes no se alteran al cambiar tasas posteriores.

## Límites reales que siguen necesitando configuración externa

- **Notificaciones push con la app cerrada:** no se activan solamente cambiando HTML. Requieren claves VAPID, guardar suscripciones, un servicio push y un proceso servidor programado (por ejemplo, Supabase Edge Functions + Cron). No se simulan como si ya estuvieran activas.
- **Face ID/Touch ID:** el PIN local es una barrera básica y no equivale a biometría. La biometría WebAuthn necesita un flujo de registro/verificación con desafío del servidor y almacenamiento seguro de credenciales; no está activada en esta entrega.
- **Conversión automática de importes y cotizaciones históricas:** las monedas se registran y se resumen por separado. Las transferencias entre monedas usan el tipo de cambio que el usuario introduce; no se consulta automáticamente una cotización.
- **Presupuestos y gastos fijos:** siguen definidos en ARS. No se aplican a otras monedas para evitar alertas engañosas.
- **Edición desde chat:** permite buscar por descripción y editar un movimiento individual; la edición completa de una compra en cuotas como grupo (importe total/cantidad y regeneración de todas las cuotas) debe hacerse desde la lógica de compra agrupada y requiere una etapa adicional.
- **Conflictos de sincronización:** la app fusiona movimientos por ID y respeta borrados, pero sigue sin resolver todos los conflictos simultáneos de preferencias/configuración con una política granular.

## Antes de publicar

1. Conservá el ZIP anterior y exportá una copia desde Ajustes.
2. Copiá tus valores reales de Supabase en `config.js` únicamente en tu copia local; solo URL de proyecto y clave pública `anon`/`publishable`. Nunca incluyas `service_role` ni claves secretas en el navegador.
3. Publicá los archivos de esta carpeta en la raíz del repositorio de GitHub Pages.
4. Probá primero con datos ficticios: ARS/USD, cuotas con centavos, edición, borrado de un grupo de cuotas, transferencias con tipo de cambio, exportación CSV, restauración y sincronización en dos dispositivos.
5. La sintaxis JavaScript se verificó. Las notificaciones requieren que actualices el cron en tu proyecto Supabase con la consulta de `NOTIFICACIONES-Y-BIOMETRIA.md`; este ZIP no puede modificar directamente la configuración remota de Supabase. La conexión real con tu proyecto de Supabase y las notificaciones push no se pueden certificar sin desplegar y probar con tu proyecto y credenciales.

## Notificaciones y biometría (código agregado en esta versión)

- Se añadió la interfaz para activar/desactivar Web Push y el Service Worker procesa los eventos `push` y los clics de notificación.
- Se añadieron Edge Functions `register-push` y `send-reminders`, y el esquema `push-schema.sql` para guardar suscripciones por usuario.
- Se añadió bloqueo biométrico local WebAuthn para intentar usar Face ID / Touch ID, con alternativa por PIN si ya está configurado.
- **Estas funciones no quedan activas automáticamente al publicar el HTML.** Hay que configurar las claves VAPID, desplegar Edge Functions, crear la tabla y programar el cron siguiendo `NOTIFICACIONES-Y-BIOMETRIA.md`.
