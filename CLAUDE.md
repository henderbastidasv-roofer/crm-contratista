# CRM para contratistas: manual para Claude Code

Este es el CRM propio de una compañía de construcción (casi siempre de techos): contactos, trabajos con tablero de etapas, propuestas Good / Better / Best con firma en línea, facturas, contratos con firma electrónica, calendario, comunicaciones, fotos, seguros y medidas. Viene del curso "Crea tu propio CRM" de ConstruIA (Rufero Pro).

La persona que te habla es **dueña o trabaja en la compañía y no sabe programar**.

## Si todavía no está instalado
Sigue `INSTALAR.md` paso a paso con la persona. Si ya está instalado, `npm run revisar` te dice cómo está todo sin enseñar claves.

## Cómo trabajas con la persona
- **Háblale en su idioma** (casi siempre español), con palabras simples. Si usas una palabra técnica, explícala en una línea.
- **Una cosa a la vez.** Una pregunta, espera la respuesta, sigue.
- **Tú haces el trabajo.** Ella contesta, crea sus cuentas y escribe sus claves en la Terminal.
- Antes de algo que no se puede deshacer (borrar datos, publicar, mandar correos), pregúntale.

## Reglas que no se rompen
1. **Las claves nunca pasan por el chat.**
   - Las escribe la persona en la Terminal con `npm run claves` (en Claude Code puede escribir `!npm run claves -- supabase`).
   - Si pega una clave en el chat, dile que la borre y la cree de nuevo en el servicio, porque ya quedó expuesta.
2. **Nunca leas ni muestres `.env.local`.**
   - No uses `cat`, `type`, Read ni grep sobre ese archivo.
   - Para saber qué falta, usa `npm run revisar` o `npm run ajustes` (no enseñan los secretos).
   - Los ajustes que no son secretos los pones tú con `npm run ajustes -- NOMBRE="valor"`.
3. **Ningún correo a un cliente sale sin que una persona lo apruebe.**
   - Comunicaciones pone todo en "Pendiente". No cambies esa regla.
   - Tampoco mandes correos de prueba a clientes reales.
4. **El dinero se suma por trabajo, no por factura.**
   - Lo facturado y lo cobrado tienen tope en el total del trabajo (`src/lib/job-money.ts`).
   - Una factura puede ser un recordatorio de otra.
5. **El cliente ve en las propuestas las partidas como "Included" y solo el precio total.** Nunca los costos ni los márgenes.
6. **No inventes datos de la compañía:** licencias, garantías, certificaciones o reseñas. Si no lo sabe, se deja vacío.
7. **Fuentes prohibidas:** Inter, Roboto y Arial, ni como respaldo en el CSS. La del CRM es Figtree.
8. **Datos de prueba:** márcalos como prueba ("Cliente Prueba") y bórralos al terminar.
9. **La base de datos se cambia solo con migraciones nuevas** en `supabase/migrations/` (número siguiente), y se aplican con `npm run tablas`. Nunca edites una migración que ya se aplicó.

## Comandos
| Comando | Para qué |
|---|---|
| `npm run dev` | El CRM en la computadora: http://localhost:3000 (córrelo en segundo plano) |
| `npm run claves` | La persona escribe sus claves (supabase, correo, stripe, google) |
| `npm run ajustes` | Ver o cambiar lo que no es secreto (nombre, dirección, zona horaria, correos) |
| `npm run revisar` | Revisa que todo esté conectado, sin enseñar claves |
| `npm run tablas` | Crea o actualiza las tablas en Supabase |
| `npm run subir-claves -- https://crm.sudominio.com` | Copia ajustes y claves a Vercel |
| `npx vercel --prod` | Publica el CRM |
| `npm run respaldo` | Baja una copia de los datos (`-- --archivos` también fotos y PDFs) |
| `npm run typecheck`, `npm run lint`, `npm test` | Revisiones del código antes de publicar |

## Skills
- `/crm-cambio`: hacer un cambio con sus palabras, probarlo y publicarlo.
- `/crm-respaldo`: bajar una copia de los datos.
- `/crm-actualizar`: traer las mejoras nuevas del curso sin perder lo suyo.
- `/crm-emergencia`: qué revisar cuando algo no funciona.

## Dónde está cada cosa
- **Páginas del CRM:** `src/app/(app)/`. Propuestas, facturas y contratos tienen su asistente paso a paso en `…/[id]/wizard`.
- **Páginas públicas que ve el cliente:**
  - `src/app/p/` (propuesta);
  - `src/app/i/` (factura);
  - `src/app/c/` (contrato);
  - `src/app/f/` (fotos).
- **Reglas de negocio:** `src/lib/`. Por ejemplo, `money.ts`, `job-money.ts`, `stages.ts`, `package-content.ts`, `templates.ts` (correos) y `contracts.ts` (plantillas de contrato).
- **Nombre de la compañía y zona horaria:** `src/lib/brand.ts`. Salen de `.env.local`.
- **Marca (logo, color, teléfono, dirección):** se guarda dentro del CRM, en Marca.
- **Esta es una versión nueva de Next.js (16).** Antes de escribir código de Next, lee la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
