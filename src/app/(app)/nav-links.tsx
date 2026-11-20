"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Inicio", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/jobs", label: "Trabajos", icon: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v7h-4z" },
  { href: "/calendar", label: "Calendario", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" },
  { href: "/contacts", label: "Contactos", icon: "M16 19a4 4 0 0 0-8 0M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19a3 3 0 0 0-3-3M17 5.5a3 3 0 0 1 0 5.5" },
  { href: "/communications", label: "Comunicaciones", icon: "M3 6h18v12H3zM3 7l9 6 9-6" },
  { href: "/proposals", label: "Propuestas", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" },
  { href: "/packages", label: "Paquetes", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" },
  { href: "/contracts", label: "Contratos", icon: "M7 3h7l5 5v13H7zM14 3v5h5M9 17c1.5-2 2.5-2 3.5 0s2 1.5 3.5-.5" },
  { href: "/invoices", label: "Invoices", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/catalog", label: "Catálogo", icon: "M4 5h16M4 10h16M4 15h10M4 20h7" },
  { href: "/team", label: "Equipo", icon: "M16 19a4 4 0 0 0-8 0M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19a3 3 0 0 0-4-2.8M3 19a3 3 0 0 1 4-2.8" },
  { href: "/settings", label: "Marca", icon: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5h2A4.5 4.5 0 0 0 21 11c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function NavLinks({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  if (compact)
    return LINKS.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        className={`my-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
          active(l.href) ? "bg-navy text-white" : "text-muted hover:bg-navy-tint hover:text-navy"
        }`}
      >
        {l.label}
      </Link>
    ));

  return (
    <nav className="grid gap-1 px-3">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
            active(l.href)
              ? "bg-navy text-white shadow-[0_8px_18px_-8px_rgba(31,107,255,0.7)]"
              : "text-muted hover:bg-navy-tint hover:text-navy"
          }`}
        >
          <Icon d={l.icon} />
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
