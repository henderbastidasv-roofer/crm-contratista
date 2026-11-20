import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/team";
import { resendInvite, revokeInvite } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const s = await requireSession();
  const db = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from("profiles").select("id, full_name, email, role, created_at").order("created_at"),
    db.from("invitations").select("id, email, full_name, role, sent_at, expires_at").is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
  ]);
  const isAdmin = s.role === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="kicker text-navy">Tu compañía</div>
        <h1 className="page-title mt-1">Equipo</h1>
        <p className="mt-2 text-muted">Cada persona entra con su propio usuario. Todo lo que hacen queda a su nombre.</p>
      </div>

      {isAdmin && <InviteForm />}

      <section className="card overflow-hidden">
        <h2 className="section-title px-5 pb-2 pt-5">Miembros · {members?.length ?? 0}</h2>
        <ul className="divide-y divide-line-soft">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-navy),var(--color-deep))] text-[12px] font-extrabold text-white">
                {(m.full_name || m.email || "?")
                  .split(/[\s@.]+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w: string) => w[0]!.toUpperCase())
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-ink">
                  {m.full_name || "Sin nombre"} {m.id === s.userId && <span className="text-faint">(tú)</span>}
                </div>
                <div className="truncate text-sm text-muted">{m.email}</div>
              </div>
              <span className="badge bg-navy-tint text-navy">{roleLabel(m.role)}</span>
            </li>
          ))}
        </ul>
      </section>

      {(invites ?? []).length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="section-title px-5 pb-2 pt-5">Invitaciones pendientes</h2>
          <ul className="divide-y divide-line-soft">
            {(invites ?? []).map((i) => {
              const expired = new Date(i.expires_at) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink">{i.full_name}</div>
                    <div className="truncate text-sm text-muted">
                      {i.email} · {roleLabel(i.role)} · {expired ? <span className="font-bold text-brand">venció</span> : `enviada ${fmtDateTime(i.sent_at)}`}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <form action={resendInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn-navy min-h-9">Reenviar</button>
                      </form>
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn-ghost min-h-9">Cancelar</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
