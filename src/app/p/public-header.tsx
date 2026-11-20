import { publicUrl } from "@/lib/branding";

type Company = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  license_number: string | null;
  logo_path?: string | null;
} | null;

export function PublicHeader({ company, title, number }: { company: Company; title: string; number: number }) {
  const logo = publicUrl(company?.logo_path);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-5 sm:px-8 sm:py-6">
      {logo ? (
        <img src={logo} alt={company?.name ?? ""} className="h-11 w-auto max-w-[220px] object-contain" />
      ) : (
        <span className="font-display text-2xl text-ink">{company?.name}</span>
      )}
      <div className="w-full text-sm sm:w-auto sm:text-right">
        <div className="kicker">{title}</div>
        <div className="num mt-0.5 text-2xl text-ink">#{number}</div>
        <div className="mt-1 break-words text-muted">{[company?.phone, company?.email].filter(Boolean).join(" · ")}</div>
        {company?.address && <div className="text-muted">{company.address}</div>}
      </div>
    </header>
  );
}
