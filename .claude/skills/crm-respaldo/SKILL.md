---
name: crm-respaldo
description: Baja una copia de todos los datos del CRM (clientes, trabajos, propuestas, facturas, contratos, pagos y, si se pide, fotos y PDFs) a la carpeta respaldos/ con la fecha. Úsalo cuando la persona escriba /crm-respaldo, pida "un respaldo", "una copia de mis datos", "bájame todo", o antes de un cambio grande o de /crm-actualizar.
---

# /crm-respaldo: copia de los datos

1. Explícale en una línea: "Voy a bajar una copia de todos tus datos a tu computadora. No cambia nada en el CRM."
2. Pregúntale si también quiere **las fotos y los PDFs**. Tarda más y pesa más; conviene una vez al mes.
3. Corre:
   - solo los datos: `npm run respaldo`;
   - con fotos y PDFs: `npm run respaldo -- --archivos`.
4. Dile cuántas filas y archivos bajó y la carpeta exacta (`respaldos/AAAA-MM-DD`).
5. Recuérdale:
   - **Ahí hay datos de sus clientes:** que lo guarde en un lugar seguro, como un disco externo o su nube con contraseña.
   - **Nunca en GitHub.** La carpeta `respaldos/` ya está fuera de git.
   - Un respaldo a la semana es buena costumbre. Si quiere, puede pedirte que lo hagas cada lunes.
6. Si tiene Supabase Pro, Supabase también guarda respaldos diarios propios (Project → Database → Backups).
