"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function saveDeliverableAction(
  projectId: string,
  deliverableId: string,
  formData: FormData
): Promise<void> {
  const { supabase } = await loadUserOr401();
  const contentMd = String(formData.get("content_md") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  await supabase
    .from("deliverables")
    .update({
      content_md: contentMd,
      ...(title ? { title } : {}),
    })
    .eq("id", deliverableId)
    .eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}/agency/deliverables/${deliverableId}`);
  redirect(
    `/projects/${projectId}/agency/deliverables/${deliverableId}?saved=1`
  );
}

export async function deleteDeliverableAction(
  projectId: string,
  deliverableId: string
): Promise<void> {
  const { supabase } = await loadUserOr401();
  // Récupère step_key pour rediriger
  const { data: row } = await supabase
    .from("deliverables")
    .select("step_key")
    .eq("id", deliverableId)
    .maybeSingle();
  await supabase
    .from("deliverables")
    .delete()
    .eq("id", deliverableId)
    .eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}/agency`);
  if (row?.step_key) {
    redirect(`/projects/${projectId}/agency/steps/${row.step_key}`);
  }
  redirect(`/projects/${projectId}/agency`);
}
