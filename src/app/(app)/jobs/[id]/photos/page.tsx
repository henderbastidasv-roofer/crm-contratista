import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadJobPhotos } from "@/lib/photos-server";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Fotos" };

export default async function JobPhotosPage(props: PageProps<"/jobs/[id]/photos">) {
  const session = await requireSession();
  const { id } = await props.params;
  const db = await createClient();
  const { data: job } = await db.from("jobs").select("id, title").eq("id", id).maybeSingle();
  if (!job) notFound();
  const [photos, { data: people }] = await Promise.all([
    loadJobPhotos(db, id),
    db.from("profiles").select("id, full_name"),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name as string]));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href={`/jobs/${id}`} className="text-[13px] font-bold text-navy hover:underline">
          ← {job.title}
        </Link>
        <h1 className="page-title mt-1">Fotos</h1>
      </div>
      <Gallery jobId={id} companyId={session.companyId} userId={session.userId} photos={photos} names={names} />
    </div>
  );
}
