import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { Camera } from "./camera";

export const metadata: Metadata = { title: "Cámara" };
export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover" };

export default async function CameraPage({ params }: PageProps<"/camera/[jobId]">) {
  const { jobId } = await params;
  const session = await requireSession();
  const db = await createClient();
  const { data: job } = await db.from("jobs").select("id, title").eq("id", jobId).maybeSingle();
  if (!job) notFound();
  return <Camera jobId={job.id} jobTitle={job.title} companyId={session.companyId} userId={session.userId} />;
}
