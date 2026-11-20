# Google Calendar y Gmail

Al conectarlo:
- **Calendario:** las citas que agendas en el CRM (inspección, reparación, reemplazo, cierre) salen en tu Google Calendar. Lo que agendas en Google sale en el CRM como **"Ocupado"**, sin detalles, para que tu equipo no vea tus citas personales.
- **Gmail:** los correos que apruebas en **Comunicaciones** (confirmaciones de cita y seguimientos) salen **desde tu Gmail**, y quedan en tus "Enviados".

Son unos **15 minutos** en Google Cloud. Es gratis. Usa **la cuenta de Google de la compañía**, la misma del calendario donde agendas.

> Antes de empezar: el CRM ya tiene que estar publicado en tu dominio (`docs/VERCEL.md`), porque Google pide las páginas de privacidad y términos: `https://crm.tudominio.com/privacy` y `/terms`. El CRM ya las trae con el nombre de tu compañía.

## 1. El proyecto
1. Entra a https://console.cloud.google.com con la cuenta de la compañía. Si te lo pide, acepta los términos.
2. Arriba, en el selector de proyectos → **New project** → nombre `CRM` → **Create**. Asegúrate de que quede seleccionado.

## 2. Prender las APIs
En el buscador de arriba busca y dale **Enable** a cada una:
- **Google Calendar API**
- **Gmail API**

## 3. La pantalla de permisos (Google Auth Platform)
Menú ☰ → **Google Auth Platform** → **Get started**:
1. **App Information:** App name = el nombre de tu CRM (ej. `Techos Ejemplo CRM`); User support email = tu correo.
2. **Audience:** **External**.
3. **Contact information:** tu correo.
4. Acepta y **Create**.

Después, en el menú de la izquierda:
- **Branding:**
  - Application home page: `https://crm.tudominio.com`
  - Privacy policy: `https://crm.tudominio.com/privacy`
  - Terms of service: `https://crm.tudominio.com/terms`
  - Authorized domains: `tudominio.com`

  Guarda.
- **Data Access → Add or remove scopes.** Busca y marca:
  - `.../auth/calendar.events`
  - `.../auth/gmail.send`

  Update y Save.
- **Audience → Publish app → Confirm.**
  - Queda "In production". No hace falta mandarla a verificar, porque es solo para tu compañía.
  - **No la dejes en "Testing":** en modo prueba, la conexión se cae cada 7 días.

## 4. Las credenciales
**Clients → Create client**:
- **Application type:** Web application. **Name:** `CRM`.
- **Authorized redirect URIs → Add URI:**
  - `https://crm.tudominio.com/api/google/callback`
  - `http://localhost:3000/api/google/callback` (para probar en tu computadora)
- **Create.** Te enseña el **Client ID** y el **Client secret**. Déjalos en la pantalla.

En Claude Code: `!npm run claves -- google` y pega los dos, **nunca en el chat**. Después:
1. `npm run subir-claves -- https://crm.tudominio.com`
2. `npx vercel --prod`

## 5. Conectar
En el CRM: **Marca → Google Calendar y Gmail → Conectar con Google**.
1. Entra con la cuenta de la compañía.
2. Google va a decir **"Google hasn't verified this app"**. Es normal, porque la app es tuya y solo la usa tu compañía. Dale **Advanced → Go to [tu CRM] (unsafe)**.
3. Marca las casillas de Calendar y Gmail → **Continue**.

Listo. Agenda una cita de prueba en el CRM y mira que salga en tu Google Calendar.

## Si algo falla
- **"redirect_uri_mismatch":** el redirect URI en Google no es exactamente `https://crm.tudominio.com/api/google/callback`. Revisa que no tenga una barra de más o `www`.
- **Se desconecta cada semana:** la app quedó en "Testing". Ve a Audience → **Publish app** y vuelve a conectar.
- **"Access blocked":** te faltó poner tu correo como soporte, o la app no está publicada.
