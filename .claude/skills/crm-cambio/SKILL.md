---
name: crm-cambio
description: Hace un cambio en el CRM de la compañía de forma segura (una etapa nueva del tablero, un campo, un texto, un correo automático, un reporte, un botón, una regla) — lo entiende, lo hace, lo prueba en la computadora y solo lo publica cuando la persona dice que sí. Úsalo cuando la persona escriba /crm-cambio o pida cambiar, agregar o quitar algo del CRM ("agrega una etapa", "quiero un campo para el color del shingle", "que el correo diga…", "cámbiale el texto a…").
---

# /crm-cambio: cambiar algo del CRM

La persona no sabe programar. Háblale simple, en su idioma.

## 1. Entender el cambio
- Si no dijo qué quiere, pregúntale en una línea: "¿Qué quieres cambiar o agregar en tu CRM?"
- Repítele el cambio con sus palabras y **dónde lo va a ver**. Ejemplo: "En el trabajo, debajo de Detalles, va a salir un campo 'Color del shingle' con una lista. ¿Así?"
- **Mira si se puede sin tocar código:**
  - Precios y lo que incluye cada paquete: **Paquetes**.
  - Partidas: **Catálogo**.
  - Logo, color, datos y documentos: **Marca**.
  - Plantillas de correo: **Comunicaciones**.
  - Plantillas de contrato: **Contratos → Plantillas**.
  - Usuarios: **Equipo**.

  Si es así, enséñale dónde y hazlo con ella.
- Si es grande (un módulo nuevo, otro idioma, una integración), dile que es más que un cambio y propónle un plan por partes.

## 2. Antes de tocar código
1. `git status`. Si hay cambios sin guardar de antes, pregúntale qué son antes de seguir.
2. Lee `CLAUDE.md` (las reglas) y, si vas a escribir código de Next.js, la guía de `node_modules/next/dist/docs/`.
3. **Si el cambio necesita la base de datos** (un campo nuevo, una tabla):
   - crea una migración **nueva** en `supabase/migrations/` con el número siguiente (ej. `0019_color_shingle.sql`);
   - usa `if not exists` y respeta las reglas de seguridad por compañía (RLS);
   - nunca edites una migración que ya se aplicó;
   - córrela con `npm run tablas`.

## 3. Hacer y probar
1. Haz el cambio más pequeño que resuelva lo que pidió. Mantén el estilo del CRM: Figtree, colores y componentes que ya existen. **Nunca Inter, Roboto ni Arial.**
2. Corre:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`

   Arregla lo que salga.
3. Si `npm run dev` no está corriendo, córrelo en segundo plano. Dile que abra la página exacta donde se ve el cambio (`http://localhost:3000/...`) y que lo pruebe. Si el cambio también se ve en el celular, que lo revise ahí.
4. Si creó datos de prueba, bórralos al terminar.

## 4. Publicar (solo si dice que sí)
1. Pregúntale: "¿Lo publico en tu CRM?"
2. Con su sí:
   1. Haz el commit, con un mensaje claro en español ("Agrega el campo color del shingle").
   2. `git push` (si tiene su repo privado).
   3. `npx vercel --prod`.
3. Si hubo migración, ya quedó en Supabase con `npm run tablas`. Es la misma base de datos para la computadora y para internet.
4. Abre el CRM publicado y confirma que el cambio se ve.

**Nunca publiques sin que diga que sí.**
