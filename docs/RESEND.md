# Resend: los correos del CRM

Con Resend el CRM manda:
- las propuestas, facturas y contratos por correo;
- los avisos para ti ("abrió tu propuesta", "firmó", "pagó");
- las invitaciones a tu equipo.

Los correos salen con tu dominio, por ejemplo `avisos@techosejemplo.com`, y no caen en spam.

**Precio** (revísalo en https://resend.com/pricing): **gratis** hasta unos 3,000 correos al mes (100 al día). Para una compañía de techos suele alcanzar.

> Si conectas Google (`docs/GOOGLE.md`), los correos que **tú apruebas** en Comunicaciones salen desde tu Gmail. Los avisos automáticos siguen saliendo por Resend.

## 1. Cuenta y dominio
1. Crea la cuenta en https://resend.com con el correo de la compañía.
2. **Domains → Add Domain** → escribe tu dominio, por ejemplo `techosejemplo.com`. En Region, deja la que sale.
3. Resend te enseña **3 o 4 registros** (DKIM, SPF y a veces MX). Ponlos donde compraste el dominio, igual que el CNAME del CRM:
   - Copia **Type**, **Name** y **Value** tal cual.
   - En GoDaddy y Namecheap, el "Name" va **sin** tu dominio al final. Por ejemplo, `resend._domainkey`, no `resend._domainkey.techosejemplo.com`.
   - **Ojo:** si ya tienes un registro SPF (`v=spf1 …`) para tu correo de Google o de Microsoft, **no pongas otro**. Pídele a Claude Code que te ayude a juntarlos en uno solo.
4. Dale **Verify DNS Records** y espera a que diga **Verified**. Pueden ser minutos o unas horas.

## 2. La clave
1. **API Keys → Create API Key** → nombre `crm`, con el permiso **Sending access**.
2. Cópiala. En Claude Code escribe `!npm run claves -- correo` y pégala ahí, **no en el chat**.
3. Claude Code pone el remitente: `npm run ajustes -- NOTIFY_FROM_EMAIL="Techos Ejemplo <avisos@techosejemplo.com>"`.
4. Si el CRM ya está publicado, después:
   1. `npm run subir-claves -- https://crm.tudominio.com`
   2. `npx vercel --prod`

## 3. Probar
En el CRM: **Marca** → probar avisos. Te tiene que llegar el correo de prueba en un minuto.

## Si algo falla
- **"You can only send testing emails to your own email address":** el dominio todavía no está **Verified** en Resend.
- **Los correos caen en spam:** revisa que los registros DKIM y SPF estén verificados. Revisa también que NOTIFY_FROM_EMAIL use **el mismo dominio** que verificaste.
