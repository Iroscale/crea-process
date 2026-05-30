"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MEMORY_SLUGS, type MemorySlug } from "@/lib/agents";

export async function saveMemoryAction(
  projectId: string,
  slug: string,
  formData: FormData
): Promise<void> {
  if (!(MEMORY_SLUGS as readonly string[]).includes(slug)) {
    redirect(
      `/projects/${projectId}/agency/memory?error=${encodeURIComponent(
        `Fichier inconnu : ${slug}`
      )}`
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contentMd = String(formData.get("content_md") ?? "");

  // Récupère version actuelle pour bump
  const { data: existing } = await supabase
    .from("client_memory")
    .select("version")
    .eq("project_id", projectId)
    .eq("slug", slug)
    .maybeSingle();
  const newVersion = ((existing?.version as number) ?? 0) + 1;

  await supabase.from("client_memory").upsert(
    {
      project_id: projectId,
      user_id: user.id,
      slug: slug as MemorySlug,
      content_md: contentMd,
      version: newVersion,
      updated_by: user.id,
    },
    { onConflict: "project_id,slug" }
  );
  revalidatePath(`/projects/${projectId}/agency/memory`);
  revalidatePath(`/projects/${projectId}/agency/memory/${slug}`);
  redirect(`/projects/${projectId}/agency/memory/${slug}?saved=1`);
}
