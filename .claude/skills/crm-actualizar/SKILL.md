---
name: crm-actualizar
description: Trae las mejoras nuevas del CRM del curso (github.com/henderbastidasv-roofer/crm-contratista) a la copia de la compañía sin perder sus cambios propios, aplica las tablas nuevas, lo prueba y lo publica cuando la persona dice que sí. Úsalo cuando la persona escriba /crm-actualizar o pregunte por "la versión nueva", "las mejoras del curso" o "actualizar el CRM".
---

# /crm-actualizar: traer las mejoras del curso

1. **Respaldo primero.** Corre `/crm-respaldo` (solo datos) antes de actualizar.
2. Revisa que no haya cambios sin guardar (`git status`). Si los hay, haz un commit con su permiso.
3. Conecta el repo del curso, si no está:
   - `git remote get-url curso`;
   - si no existe: `git remote add curso https://github.com/henderbastidasv-roofer/crm-contratista.git`.
4. `git fetch curso`.
5. Enséñale en lenguaje simple qué trae la versión nueva:
   - `git log --oneline HEAD..curso/main`;
   - si hace falta, lee los cambios.

   Ejemplo: "Trae 3 mejoras: …". Pregúntale si las quiere.
6. Con su sí: `git merge curso/main`.
   - Si hay **conflictos**, es porque ella cambió algo que el curso también cambió. Resuélvelos **conservando sus cambios** y agregando lo nuevo.
   - Si dudas, pregúntale qué prefiere.
   - Nunca borres sus cambios para que "entre limpio".
7. `npm install` (por si hay paquetes nuevos).
8. `npm run tablas`: aplica las migraciones nuevas, si hay.
9. Corre `npm run typecheck`, `npm run lint` y `npm test`, y arregla lo que salga.
10. `npm run dev` y que revise las pantallas que cambiaron.
11. Pregúntale si lo publica. Con su sí:
    1. `git push` (a su repo privado).
    2. `npx vercel --prod`.
    3. Abre el CRM publicado para confirmar.
12. Si la versión nueva trae ajustes nuevos en `.env.ejemplo`, dile cuáles son y ponlos:
    - `npm run ajustes`, si no son secretos;
    - `npm run claves`, si son secretos;
    - y después `npm run subir-claves`.
