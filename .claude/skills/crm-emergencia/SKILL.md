---
name: crm-emergencia
description: Revisa en orden lo que más falla cuando el CRM no funciona — no abre, no deja entrar, no salen los correos, el cliente no puede firmar o pagar, el calendario no se sincroniza — y lo arregla o le dice a la persona exactamente qué hacer. Úsalo cuando la persona escriba /crm-emergencia o diga que algo del CRM "no sirve", "no abre", "se cayó", "no llegan los correos".
---

# /crm-emergencia: algo no funciona

Calma y en orden. Pregúntale en una línea **qué pasa y desde cuándo**. Después revisa en este orden y para en cuanto encuentres el problema:

1. **`npm run revisar`.** Te dice, sin enseñar claves, qué está mal: Supabase, tablas, correos, Stripe o Google.
2. **El CRM no abre en internet:**
   - `npx vercel ls --prod`: ¿el último deploy dice Ready?
   - Si dice Error: `npx vercel inspect <url> --logs`. Explícale el error y arréglalo. O vuelve al deploy anterior con `npx vercel rollback`, con su permiso.
   - ¿Abre `https://<proyecto>.vercel.app` pero no su dominio? Es el DNS: Vercel → Settings → Domains. ¿Se venció el dominio? Que lo revise donde lo compró.
3. **Abre pero no carga datos, o sale error al entrar:** el proyecto de Supabase en plan Free se pausa después de 7 días sin uso. Que entre a supabase.com → su proyecto → **Restore**. Si pasa seguido, recomiéndale Supabase Pro.
4. **No lo deja entrar o no le llega el correo de contraseña:**
   - Revisa Supabase → Authentication → URL Configuration (Site URL y Redirect URLs con su dominio).
   - Revisa que su correo esté en `SIGNUP_ALLOWED_EMAILS` (para cuentas nuevas) o que lo hayan invitado desde **Equipo**.
5. **No salen los correos ni los avisos:**
   - Resend → Domains: ¿sigue **Verified**?
   - Resend → Logs: ¿qué error dice?
   - En el CRM → **Comunicaciones**: ¿el correo quedó en **Pendiente** (falta aprobarlo) o en **Falló** (tiene el motivo y un botón para reintentar)?
6. **El cliente no puede firmar o pagar:**
   - Abre el link (`/p/…`, `/i/…`, `/c/…`) en una ventana privada.
   - Para pagos: Stripe → Developers → Webhooks: ¿hay errores? `npm run revisar` dice si está en modo prueba o real.
7. **El calendario no se sincroniza con Google:**
   - **Marca → Google Calendar y Gmail.** Si dice desconectado, que conecte otra vez.
   - Si se cae cada semana, la app de Google quedó en "Testing": ver `docs/GOOGLE.md`.
8. Si nada de eso es, lee los logs de Vercel (`npx vercel logs <url>`) a la hora en que falló. Busca el error y explícaselo simple.

Al terminar dile:
- qué era;
- qué hiciste;
- qué hacer si vuelve a pasar.

Si cambiaste código, sigue `/crm-cambio` para publicarlo.
