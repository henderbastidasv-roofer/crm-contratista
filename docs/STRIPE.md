# Stripe: cobrar facturas en línea (opcional)

Con Stripe, la factura que le mandas al cliente trae un botón **Pay**. Paga con banco (ACH) o con tarjeta. El dinero entra a **tu** cuenta de Stripe y de ahí a tu banco. El CRM marca la factura pagada y te avisa.

**Cuánto cobra Stripe** (revísalo en https://stripe.com/pricing):
- **Banco (ACH):** 0.8%, con un máximo de $5 por pago. En una factura de $15,000 son $5. Tarda de 3 a 5 días hábiles.
- **Tarjeta:** 2.9% + 30¢. En $15,000 son unos $435.

Por eso conviene pedirle al cliente que pague con banco.

Sin Stripe, el CRM funciona igual. Los pagos (cheque, Zelle, efectivo, cheque del seguro) se registran a mano en cada factura.

## 1. Cuenta
Crea la cuenta en https://dashboard.stripe.com/register con los datos de la compañía. Para cobrar de verdad, Stripe te pide:
- el EIN;
- la cuenta de banco;
- los datos del dueño.

Mientras tanto puedes probar todo en **modo prueba**.

## 2. Modo prueba primero
1. En el dashboard, prende **Test mode** (arriba a la derecha).
2. **Developers → API keys** → **Secret key** (empieza con `sk_test_`).
3. **Developers → Webhooks → Add endpoint**:
   - **Endpoint URL:** `https://crm.tudominio.com/api/stripe/webhook`
   - **Events:**
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `account.updated`
   - Guarda y copia el **Signing secret** (empieza con `whsec_`).
4. En Claude Code: `!npm run claves -- stripe` y pega las dos, **nunca en el chat**.
5. Después:
   1. `npm run subir-claves -- https://crm.tudominio.com`
   2. `npx vercel --prod`
6. En el CRM: **Marca → Pagos en línea (Stripe)** → **Activar cobros con mi cuenta de Stripe**.
7. Haz una factura de prueba de $1 a tu correo, ábrela y paga con la tarjeta de prueba:
   - número `4242 4242 4242 4242`;
   - una fecha futura;
   - cualquier CVC.

   La factura tiene que quedar **Paid** y te tiene que llegar el aviso.

## 3. Pasar a cobrar de verdad
Cuando todo funcione:
1. Apaga **Test mode** y termina la activación de la cuenta (datos del negocio y banco).
2. Repite los pasos 2 y 3 de arriba en modo real:
   - la clave `sk_live_`;
   - un webhook nuevo en modo real, con su `whsec_` nuevo.
3. Corre `npm run claves -- stripe` otra vez, luego `subir-claves` y publica.

`npm run revisar` te dice si Stripe está en modo **prueba** o **REAL**.
