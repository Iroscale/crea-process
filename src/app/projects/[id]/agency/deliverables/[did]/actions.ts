"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  updateDeliverableVersioned,
  restoreDeliverableVersion,
} from "@/lib/agency";
import { chatOnDeliverable } from "@/lib/agents";

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
  const { supabase, userId } = await loadUserOr401();
  const contentMd = String(formData.get("content_md") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  // P0.4 : snapshot de l'ancienne version puis version++
  const res = await updateDeliverableVersioned(supabase, {
    userId,
    deliverableId,
    newContentMd: contentMd,
    newTitle: title || undefined,
    source: "manual",
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/deliverables/${deliverableId}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/projects/${projectId}/agency/deliverables/${deliverableId}`);
  redirect(
    `/projects/${projectId}/agency/deliverables/${deliverableId}?saved=1`
  );
}

// ── P0.2 : chat itératif sur le livrable ─────────────────────────────────
export async function sendChatMessageAction(
  projectId: string,
  deliverableId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    redirect(`/projects/${projectId}/agency/deliverables/${deliverableId}`);
  }
  const res = await chatOnDeliverable({
    supabase,
    userId,
    projectId,
    deliverableId,
    userMessage: message,
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/deliverables/${deliverableId}?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/projects/${projectId}/agency/deliverables/${deliverableId}`);
  redirect(`/projects/${projectId}/agency/deliverables/${deliverableId}#chat-end`);
}

/**
 * Applique la proposition d'un message assistant comme nouvelle version
 * du livrable (choix explicite de l'opérateur).
 */
export async function applyProposalAction(
  projectId: string,
  deliverableId: string,
  messageId: string
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();

  const { data: msg } = await supabase
    .from("deliverable_messages")
    .select("proposed_content_md")
    .eq("id", messageId)
    .eq("deliverable_id", deliverableId)
    .maybeSingle();
  const proposed = (msg?.proposed_content_md as string) ?? "";
  if (!proposed.trim()) {
    redirect(
      `/projects/${projectId}/agency/deliverables/${deliverableId}?error=${encodeURIComponent(
        "Pas de proposition à appliquer sur ce message"
      )}`
    );
  }

  const res = await updateDeliverableVersioned(supabase, {
    userId,
    deliverableId,
    newContentMd: proposed,
    source: "chat",
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/deliverables/${deliverableId}?error=${encodeURIComponent(res.error)}`
    );
  }

  // Trace la version appliquée sur le message
  await supabase
    .from("deliverable_messages")
    .update({ applied_version: res.newVersion })
    .eq("id", messageId);

  revalidatePath(`/projects/${projectId}/agency/deliverables/${deliverableId}`);
  redirect(
    `/projects/${projectId}/agency/deliverables/${deliverableId}?saved=1`
  );
}

export async function restoreVersionAction(
  projectId: string,
  deliverableId: string,
  versionId: string
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const res = await restoreDeliverableVersion(supabase, {
    userId,
    deliverableId,
    versionId,
  });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency/deliverables/${deliverableId}?error=${encodeURIComponent(res.error)}`
    );
  }
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
