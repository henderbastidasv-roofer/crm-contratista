# Instalar el CRM: guía para Claude Code

Esta guía la sigue **Claude Code**, no la persona. La persona es dueña o trabaja en una compañía de construcción y **no sabe programar**. Tu trabajo es llevarla de la mano hasta que tenga su CRM **funcionando en internet con su dominio**, con su marca y sus precios, y sepa usarlo.

Lee también `CLAUDE.md`: ahí están las reglas que no se rompen. Las más importantes:
- las claves nunca pasan por el chat;
- nunca leas `.env.local`;
- ningún correo sale a un cliente sin aprobación.

## Cómo trabajas
- Una cosa a la vez, con palabras simples y en su idioma.
- **Tú corres los comandos.** Las claves las escribe ella en la Terminal: dile que escriba en Claude Code `!npm run claves -- supabase` (con el `!` adelante), pegue lo que le pide y presione Enter.
  - Lo secreto se ve como `****`; es normal.
  - Si no puede escribir en esa Terminal, que abra una aparte en la carpeta del CRM y corra el mismo comando sin el `!`.
- Cuando tenga que entrar a una página (Supabase, Vercel, Resend, Google), dale **el link exacto y los botones en orden**, como receta. Espera a que diga "listo" antes de seguir.
- Al terminar cada fase, corre `npm run revisar` y cuéntale en una línea cómo va.
- **Si algo falla, no te lo saltes.** Lee el error, explícaselo simple y arréglalo.

## Fase 0 · Antes de empezar
1. Confirma que estás en la carpeta del CRM: el `package.json` dice `"name": "crm-contratista"`.
2. **La carpeta no puede estar dentro de OneDrive, iCloud ni Dropbox**, porque se traba y pierde archivos.
   - Si está ahí, muévela a `C:\Users\<usuario>\Proyectos\crm` (Windows) o `~/Proyectos/crm` (Mac) y sigue desde ahí.
3. `node -v` tiene que dar 20 o más. Si no, que lo instale de https://nodejs.org (botón **LTS**) y vuelva a abrir Claude Code.
4. `git --version`. Si no está, en Windows que instale https://git-scm.com/download/win; en Mac se instala solo la primera vez que lo pidas.
5. Corre `npm install` (tarda 1 o 2 minutos).
6. Cuéntale el plan en 6 líneas:
   1. El nombre de su compañía y su correo.
   2. La base de datos en Supabase (gratis para empezar).
   3. Probarlo en su computadora y meter su marca y sus precios.
   4. Publicarlo en internet con su dominio (Vercel).
   5. Que salgan los correos (Resend).
   6. Opcional: cobrar en línea (Stripe) y conectar Google Calendar y Gmail.

   Dile que en total son unos 60 a 90 minutos y que puede parar entre fases.

## Fase 1 · Su compañía
Pregunta una por una y guarda con `npm run ajustes -- …`:
1. ¿Cómo se llama la compañía, con el nombre legal (LLC, Inc.)? → `NEXT_PUBLIC_COMPANY_NAME="Techos Ejemplo LLC"`.
2. ¿Cómo quiere llamar al CRM? Si no le importa, `"<Compañía> CRM"` → `NEXT_PUBLIC_APP_NAME`.
3. ¿Con qué correo va a entrar el dueño? → `SIGNUP_ALLOWED_EMAILS="dueno@…"`. Solo esos correos pueden crear cuenta; al equipo se le invita después desde el CRM.
4. ¿En qué estado trabaja? → `NEXT_PUBLIC_TIME_ZONE`:
   - Central: `America/Chicago` (TX, IL, OK…).
   - Este: `America/New_York` (FL, GA, NC…).
   - Montaña: `America/Denver` (CO, UT).
   - Arizona: `America/Phoenix`.
   - Pacífico: `America/Los_Angeles` (CA, WA, NV).
5. `NEXT_PUBLIC_APP_URL="http://localhost:3000"` (por ahora; cambia al publicar).

## Fase 2 · La base de datos (Supabase)
Lee con ella `docs/SUPABASE.md`. En resumen:
1. Que cree su cuenta en https://supabase.com (con el correo de la compañía) y un proyecto nuevo:
   - **Name:** `crm`.
   - **Database password:** que la genere con el botón y **la guarde en su gestor de contraseñas**, porque la va a necesitar en el paso 3.
   - **Region:** la más cercana (ej. East US para Texas y la costa este; West US para California).
2. Cuando el proyecto esté listo, que corra `!npm run claves -- supabase` y pegue, en este orden:
   1. **Project URL**: botón **Connect** arriba, o Project Settings → Data API.
   2. **Publishable key**: Project Settings → API Keys.
   3. **Secret key**: en la misma página; botón para revelarla.
   4. **Connection string**: Connect → **Session pooler**. Antes de pegarla tiene que cambiar `[YOUR-PASSWORD]` por la contraseña del paso 1.
3. Corre `npm run tablas`. Tienen que salir ✓ de la 0001 a la última.
4. Corre `npm run revisar`.

## Fase 3 · Probarlo en su computadora
1. Corre `npm run dev` **en segundo plano** y dile que abra http://localhost:3000.
2. **Crear cuenta** con el correo de `SIGNUP_ALLOWED_EMAILS` y una contraseña de 10 o más caracteres.
   - Le llega un correo de Supabase para confirmar. Que lo abra **en la misma computadora**.
   - Si no llega en 2 minutos, que revise el spam. Supabase solo manda pocos correos por hora con su servidor gratis.
3. El primer paso del CRM le pide:
   - el nombre de la compañía;
   - su nombre;
   - el teléfono;
   - la dirección;
   - **el impuesto** (Texas 8.25%; que te diga el de su ciudad);
   - el número con el que empiezan sus facturas. Si viene de otro CRM, que ponga el siguiente que le toca para no repetir números.
4. Dale el recorrido de 2 minutos por el menú:
   - **Trabajos** (el tablero de etapas);
   - **Contactos**;
   - **Propuestas** y **Paquetes**;
   - **Invoices**;
   - **Contratos**;
   - **Calendario**;
   - **Comunicaciones**;
   - **Marca**.
5. **Marca:** que suba su logo (PNG o SVG), escoja su color y llene:
   - el teléfono, el correo y la dirección;
   - la licencia (solo si su estado la da);
   - la página web;
   - el "about" (2 o 3 frases en inglés; ayúdale a escribirlas con sus palabras);
   - por qué escogerlos.

   **No inventes nada.**
6. **Paquetes:** enséñale Good / Better / Best (vienen de ejemplo con IKO Cambridge, OC Duration y Duration FLEX).
   - Pregúntale qué materiales instala y **cuánto cobra por square** en cada paquete.
   - Con eso ajusta los paquetes, lo que incluye cada uno, las garantías **que de verdad da** y los upgrades.
7. **Una propuesta de prueba de punta a punta**, con un cliente "Cliente Prueba" y **su propio correo**:
   1. Trabajo nuevo.
   2. Botón "+ Crear propuesta".
   3. Los 7 pasos.
   4. Que la abra desde su celular y vea que le llega el aviso de "abrió".

   Al terminar, bórralo todo.

## Fase 4 · Publicarlo con su dominio (Vercel)
Lee con ella `docs/VERCEL.md`.
1. **Su copia en GitHub** (es su respaldo del código, privado). Si no tiene cuenta, que la cree en https://github.com.
   - `git init` (si hace falta).
   - Commit "Mi CRM".
   - `gh repo create <compania>-crm --private --source . --push`. Si no tiene `gh`, guíala para crear el repo privado en la web y conectarlo.
   - **Nunca público:** es su sistema.
2. **Vercel:** que cree su cuenta en https://vercel.com con su GitHub.
   - El plan Hobby es gratis, pero solo para uso personal. Para una compañía es **Pro (~$20 al mes)**.
   - Después:
     1. `npx vercel login`.
     2. `npx vercel link` (proyecto nuevo, nombre `<compania>-crm`).
3. **El dominio:** el CRM va en un subdominio de su página, por ejemplo `crm.techosejemplo.com`.
   1. En Vercel: Project → Settings → Domains → Add.
   2. Vercel le dice qué registro poner (casi siempre un **CNAME** `crm` → `cname.vercel-dns.com`).
   3. Ese registro se pone donde compró el dominio (GoDaddy, Namecheap, Cloudflare, Squarespace…). Guíala con botones exactos según dónde sea.
4. `npm run ajustes -- NEXT_PUBLIC_APP_URL="https://crm.techosejemplo.com"`.
5. `npm run subir-claves -- https://crm.techosejemplo.com`.
6. `npx vercel --prod`.
7. **Supabase → Authentication → URL Configuration:**
   - **Site URL** = `https://crm.techosejemplo.com`;
   - en **Redirect URLs** que agregue `https://crm.techosejemplo.com/**` y `http://localhost:3000/**`.
8. Que entre a su CRM en el dominio, desde la computadora y desde el celular.
   - En el iPhone: Compartir → **Agregar a inicio**, y queda como app.

## Fase 5 · Que salgan los correos (Resend)
Sin esto el CRM funciona, pero no manda las propuestas por correo, ni los avisos, ni las invitaciones al equipo. Lee con ella `docs/RESEND.md`.
1. Cuenta en https://resend.com (gratis hasta ~3,000 correos al mes).
2. **Domains → Add Domain** con su dominio. Resend le da 3 o 4 registros DNS (DKIM y SPF) que se ponen donde compró el dominio, igual que el CNAME. Que espere a que diga **Verified**.
3. **API Keys → Create API Key** (Sending access). Después, `!npm run claves -- correo`.
4. `npm run ajustes -- NOTIFY_FROM_EMAIL="Techos Ejemplo <avisos@techosejemplo.com>"`.
5. `npm run subir-claves -- <su URL>` y `npx vercel --prod`.
6. En el CRM: Marca → probar avisos. Le tiene que llegar el correo de prueba.

## Fase 6 · Opcionales
- **Cobrar facturas en línea con Stripe:** `docs/STRIPE.md`.
  - Primero en modo prueba con la tarjeta `4242 4242 4242 4242`.
  - Después con la cuenta real.
- **Google Calendar y Gmail:** `docs/GOOGLE.md`. Son unos 15 minutos en Google Cloud.
  - Al terminar, sus citas del CRM salen en su Google Calendar.
  - Los correos que aprueba en Comunicaciones salen desde su Gmail.
- **Traer sus clientes de otro CRM:** en el CRM, en la dirección `/import`.
  - Sube el CSV de contactos de Roofr (o de otro CRM; las columnas se acomodan) y las propuestas viejas en PDF.
  - Primero que baje un respaldo de su CRM viejo.

## Fase 7 · Terminado
1. `npm run revisar` sin ❌.
2. Enséñale los 4 skills:
   - `/crm-cambio` para pedir cambios con sus palabras;
   - `/crm-respaldo` una vez a la semana;
   - `/crm-actualizar` cuando salgan mejoras;
   - `/crm-emergencia` si algo falla.
3. **Su tarea:** un cliente de prueba de punta a punta en el CRM publicado (lead → cita → propuesta firmada → contrato → factura). Después lo borra y comparte una captura en la comunidad de ConstruIA.
