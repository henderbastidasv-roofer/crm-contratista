# CRM para contratistas · ConstruIA

Tu propio CRM, publicado en tu dominio y con tu marca. Es el mismo que usa Proud Roofing (Houston) para reemplazar a Roofr, hecho configurable para cualquier compañía.

- **Trabajos** en un tablero por etapas (seguros, retail, reparaciones y subcontrato), con notas, fotos, archivos y todo el historial.
- **Propuestas Good / Better / Best** en 7 pasos. El cliente las abre en el celular, **te avisa cuando las abre**, marca upgrades y **firma en línea**.
- **Facturas** paso a paso y pagos registrados. Si quieres, cobro en línea con Stripe (ACH o tarjeta). El dinero se suma por trabajo.
- **Contratos y certificados** con firma electrónica propia (ESIGN/UETA). La copia firmada queda en los archivos del cliente.
- **Calendario** con Google Calendar, y **comunicaciones** con aprobación obligatoria antes de que salga cualquier correo.
- **Seguros:** claim, ajustador, supplements y cheques. También medidas y reportes.
- **Importar** tus clientes de Roofr (o de otro CRM) por CSV, y tus propuestas viejas en PDF.
- **Sin pagar por usuario.** Los datos son tuyos.

Hecho con Next.js 16 y Supabase, publicado en Vercel.

## Instalarlo
Abre Claude Code y pega el prompt de [PROMPT-PARA-PEGAR.md](PROMPT-PARA-PEGAR.md). Claude Code te lleva paso a paso con [INSTALAR.md](INSTALAR.md). No hace falta saber programar.

**Lo que necesitas** (precios a noviembre de 2026; revísalos en cada página):

| Servicio | Para qué | Precio |
|---|---|---|
| [Claude](https://claude.com/pricing) Pro o Max | Claude Code instala y mantiene el CRM | desde $20 al mes |
| [GitHub](https://github.com) | Tu copia privada del código | gratis |
| [Supabase](https://supabase.com/pricing) | La base de datos | gratis para empezar; Pro ~$25 al mes |
| [Vercel](https://vercel.com/pricing) | El CRM en internet | Pro ~$20 al mes (Hobby es solo uso personal) |
| [Resend](https://resend.com/pricing) | Los correos y avisos | gratis hasta ~3,000 al mes |
| Tu dominio | `crm.tudominio.com` | el que ya tienes |
| [Stripe](https://stripe.com/pricing) (opcional) | Cobrar en línea | ACH 0.8% (máx. $5), tarjeta 2.9% + 30¢ |
| [Google Cloud](https://console.cloud.google.com) | Calendar y Gmail | gratis |

## Mantenerlo con IA
Dentro de la carpeta del CRM, en Claude Code:
- `/crm-cambio`: pide un cambio con tus palabras. Se prueba antes y se publica cuando dices que sí.
- `/crm-respaldo`: baja una copia de tus datos.
- `/crm-actualizar`: trae las mejoras nuevas de este repo sin perder lo tuyo.
- `/crm-emergencia`: qué revisar cuando algo no funciona.

## Guías
- [Supabase](docs/SUPABASE.md)
- [Vercel y tu dominio](docs/VERCEL.md)
- [Resend](docs/RESEND.md)
- [Stripe](docs/STRIPE.md)
- [Google Calendar y Gmail](docs/GOOGLE.md)

Las plantillas de contrato son un punto de partida: **revísalas con tu abogado** antes de usarlas con clientes.

## Licencia
MIT. Úsalo, cámbialo y compártelo.

Rufero Pro · [ConstruIA](https://www.skool.com/construia)
