# Supabase: la base de datos del CRM

Supabase guarda tus clientes, trabajos, propuestas, facturas, fotos y documentos firmados. **Es tuyo**: la cuenta está a tu nombre y nadie más ve tus datos.

**Precio** (revísalo en https://supabase.com/pricing):
- **Free:** $0. Alcanza para empezar. **Ojo:** si pasan 7 días sin que nadie use el CRM, el proyecto se pausa. Se reactiva con un clic (Restore), pero mientras tanto el CRM no abre.
- **Pro:** unos $25 al mes. No se pausa y trae respaldos diarios. Recomendado cuando ya lo uses todos los días con clientes reales.

## 1. Crear el proyecto
1. Entra a https://supabase.com y dale **Start your project**. Crea la cuenta con el correo de la compañía (o con GitHub).
2. **New project**:
   - **Organization:** la de tu compañía.
   - **Project name:** `crm`.
   - **Database Password:** dale **Generate a password** y **guárdala en tu gestor de contraseñas**. La vas a necesitar en un minuto.
   - **Region:** la más cercana a ti. Por ejemplo, East US (North Virginia) para Texas y la costa este, o West US para California.
3. **Create new project.** Tarda 1 o 2 minutos.

## 2. Guardar las claves (en la Terminal, nunca en el chat)
En Claude Code escribe `!npm run claves -- supabase` y pega cada valor cuando te lo pida:

| Te pide | Dónde está |
|---|---|
| Project URL | Botón **Connect** (arriba) o Project Settings → **Data API**. Es `https://xxxx.supabase.co` |
| Publishable key | Project Settings → **API Keys** → empieza con `sb_publishable_` |
| Secret key | Misma página → **Secret keys**, botón del ojo para verla. Empieza con `sb_secret_`. **Nunca la compartas** |
| Connection string | Botón **Connect** → pestaña **Connection String** → **Session pooler**. Copia la línea, **cambia `[YOUR-PASSWORD]` por tu contraseña** del paso 1 y pégala |

## 3. Crear las tablas
Claude Code corre `npm run tablas`. Tiene que salir una ✓ por cada archivo, de la 0001 a la última, y al final "Base de datos al día".

## 4. Cuando lo publiques (fase de Vercel)
En **Authentication → URL Configuration**:
- **Site URL:** `https://crm.tudominio.com`
- **Redirect URLs:** agrega `https://crm.tudominio.com/**` y `http://localhost:3000/**`

Sin esto, el correo de confirmación de cuenta y los de "olvidé mi contraseña" te mandan a la dirección equivocada.

## Si algo falla
- **"Supabase contestó 5xx" o no carga nada:** el proyecto se pausó por falta de uso. Entra a supabase.com y dale **Restore project**.
- **"password authentication failed":** la contraseña de la base de datos está mal. Puedes cambiarla en Project Settings → Database → **Reset database password**. Después corre otra vez `npm run claves -- supabase` y pega la Connection string nueva.
- **No llega el correo para confirmar la cuenta:** revisa el spam. El servidor gratis de Supabase solo manda unos pocos correos por hora.
