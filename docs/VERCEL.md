# Vercel: tu CRM en internet, con tu dominio

Vercel es donde vive el CRM para que lo abras desde cualquier computadora o celular, en una dirección como `https://crm.techosejemplo.com`.

**Precio** (revísalo en https://vercel.com/pricing):
- **Hobby:** gratis, pero **solo para uso personal, no comercial**.
- **Pro:** unos $20 al mes por persona que administra la cuenta, no por cada empleado que usa el CRM. Es el que corresponde a una compañía.

## 1. Tu copia del código en GitHub (privada)
Es tu respaldo del código y el historial de cada cambio. **Siempre privado.**
1. Si no tienes cuenta, créala en https://github.com.
2. Claude Code la sube por ti: `gh repo create <compania>-crm --private --source . --push`. Si no tienes la herramienta `gh`, te guía para hacerlo en la página.

## 2. Conectar la carpeta con Vercel
1. Crea tu cuenta en https://vercel.com, con **Continue with GitHub**.
2. Claude Code corre:
   1. `npx vercel login`. Se abre el navegador; confirma.
   2. `npx vercel link`. Elige **crear un proyecto nuevo**, con el nombre `<compania>-crm`.

## 3. Tu dominio
El CRM va en un **subdominio** de tu página: `crm.` + tu dominio. Tu página web sigue igual.
1. En Vercel: tu proyecto → **Settings → Domains → Add** → escribe `crm.tudominio.com`.
2. Vercel te dice qué registro poner. Casi siempre es:
   - **Tipo:** CNAME.
   - **Nombre/Host:** `crm`.
   - **Valor:** el que te da Vercel (por ejemplo `cname.vercel-dns.com` o uno que termina en `vercel-dns-0xx.com`).
3. Ponlo **donde compraste el dominio**:
   - **GoDaddy:** My Products → tu dominio → **DNS** → Add New Record.
   - **Namecheap:** Domain List → **Manage** → Advanced DNS → Add New Record.
   - **Cloudflare:** tu dominio → **DNS** → Add record. Déjalo en **DNS only** (nube gris).
   - **Squarespace / Google Domains:** Domains → tu dominio → **DNS** → Custom records.
4. Espera a que Vercel diga **Valid Configuration**. Suele tardar minutos; a veces hasta 1 hora.

## 4. Las claves y publicar
Claude Code corre:
1. `npm run ajustes -- NEXT_PUBLIC_APP_URL="https://crm.tudominio.com"`
2. `npm run subir-claves -- https://crm.tudominio.com`: copia tus ajustes y claves a Vercel sin enseñarlas.
3. `npx vercel --prod`: publica. Tarda unos 2 minutos.

Después, en **Supabase → Authentication → URL Configuration** pon la Site URL y las Redirect URLs (lo explica `docs/SUPABASE.md`).

## 5. En el celular
- **iPhone:** abre `https://crm.tudominio.com` en Safari → Compartir → **Agregar a inicio**.
- **Android:** en Chrome → menú ⋮ → **Agregar a la pantalla principal**.

Queda como una app, con su ícono.

## Cada vez que cambies algo
Usa `/crm-cambio`: hace el cambio, lo prueba y, cuando le dices que sí, publica con `npx vercel --prod`.
