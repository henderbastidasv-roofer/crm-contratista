"use client";

import { useFormStatus } from "react-dom";

/** Botón de formulario que pide confirmación antes de enviar y se bloquea mientras procesa. */
export function ConfirmSubmit({
  message,
  children,
  className,
  formAction,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  /** Para un segundo botón dentro de un formulario (ej. "Borrar" junto a "Guardar"). */
  formAction?: (form: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      formAction={formAction}
      formNoValidate={Boolean(formAction)}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}
