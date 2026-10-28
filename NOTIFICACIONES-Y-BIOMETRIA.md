# Notificaciones push y Face ID / Touch ID para Mis finanzas

Esta entrega agrega la interfaz y el código necesario. Para que las notificaciones lleguen con la app cerrada hay que desplegar las funciones de Supabase y configurar claves/cron. No hay claves privadas incluidas en el ZIP.

## 1. Face ID / Touch ID

1. Publicá los archivos actualizados en GitHub Pages y abrí la app con Safari en el iPhone.
2. Agregá la app a la pantalla de inicio: Safari → Compartir → Agregar a pantalla de inicio. Abrí la app desde ese ícono.
3. Iniciá sesión y entrá en Ajustes → Bloqueo de acceso → Configurar Face ID / Touch ID.
4. Aceptá el diálogo del sistema. Al volver a abrir la app, tocá “Desbloquear con Face ID / Touch ID”. Si configuraste PIN, podés usarlo como alternativa.

**Límite de seguridad:** esta es una barrera biométrica local del dispositivo, basada en WebAuthn con desafío generado en el navegador. No es una autenticación biométrica verificada por el servidor y no sustituye la contraseña/login de Supabase. Si el navegador o el dominio no permite registrar una credencial de plataforma, la app mostrará el error y seguirá disponible el PIN.

## 2. Generar claves VAPID

En una computadora con Node.js:

```bash
npx web-push generate-vapid-keys
```

Guardá la clave **Public Key** para `config.js`; la **Private Key** es secreta y solo va a Supabase. Nunca subas la clave privada a GitHub ni la pongas en el HTML.

En `config.js`, completá:

```js
vapidPublicKey: 'PEGAR_AQUI_LA_PUBLIC_KEY_VAPID'
```

La URL y la clave pública `anon`/`publishable` de Supabase siguen siendo las de tu proyecto. Nunca uses `service_role` en el navegador.

## 3. Crear tabla de suscripciones

En Supabase → SQL Editor, ejecutá el archivo `push-schema.sql`.

## 4. Desplegar Edge Functions

Instalá Supabase CLI, abrí una terminal en la carpeta `mis-finanzas-pwa` y vinculá tu proyecto:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
```

Configurá secretos del servidor (reemplazá los valores por los tuyos; no los compartas ni los agregues al repositorio):

```bash
supabase secrets set VAPID_PUBLIC_KEY="TU_VAPID_PUBLIC_KEY" VAPID_PRIVATE_KEY="TU_VAPID_PRIVATE_KEY" VAPID_SUBJECT="mailto:TU_CORREO" CRON_SECRET="UNA_CADENA_LARGA_ALEATORIA"
```

Desplegá las funciones:

```bash
supabase functions deploy register-push
supabase functions deploy send-reminders --no-verify-jwt
```

`register-push` exige una sesión válida del usuario. `send-reminders` usa `CRON_SECRET` como autorización del cron.

## 5. Programar los recordatorios diarios

En Supabase SQL Editor, habilitá las extensiones si aún no están activas:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
```

Guardá el mismo secreto `CRON_SECRET` en Vault (una sola vez):

```sql
select vault.create_secret('PEGAR_EL_MISMO_CRON_SECRET', 'mf_push_cron_secret', 'Autorización del cron de notificaciones de Mis finanzas');
```

Luego programá la función para todos los días a las 12:00 UTC (09:00 de Argentina): reemplazá `TU_PROJECT_REF` por el ref de tu proyecto.

```sql
select cron.schedule(
  'mis-finanzas-recordatorios-diarios',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mf_push_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Para comprobar el trabajo programado:

```sql
select * from cron.job where jobname = 'mis-finanzas-recordatorios-diarios';
```

La función revisa las fechas de cierre/vencimiento de tarjetas, vencimientos configurados y días de gastos fijos guardados en `datos.doc`. Envía aviso si encuentra fechas entre hoy y los próximos 3 días. Las notificaciones dependen de que el dispositivo haya concedido permiso y conserve una suscripción push válida.

## 6. Activar desde el iPhone

1. Publicá `index.html`, `config.js`, `push.js`, `biometric.js`, `sw.js` y el resto de los archivos en GitHub Pages.
2. Instalá/abrí la PWA desde la pantalla de inicio del iPhone (requisito de iOS para Web Push).
3. Iniciá sesión, abrí Ajustes → Notificaciones → Activar notificaciones y aceptá el permiso.
4. Probá una notificación y revisá los logs de `send-reminders` en Supabase.

## Seguridad y límites

- Nunca publiques `VAPID_PRIVATE_KEY`, `CRON_SECRET` ni la clave `service_role`.
- La función push envía notificaciones genéricas sobre vencimientos; no incluye montos ni detalles sensibles.
- Si el proyecto Supabase gratuito se pausa, las funciones programadas no podrán enviar notificaciones hasta que el proyecto vuelva a estar activo.
- Las notificaciones de navegador no garantizan entrega inmediata; iOS y el proveedor push administran la entrega.
