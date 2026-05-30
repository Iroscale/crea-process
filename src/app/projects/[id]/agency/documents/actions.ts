"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  uploadDocument,
  deleteDocument,
  updateDocumentMeta,
} from "@/lib/agency";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function uploadDocumentsAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const category = String(formData.get("category") ?? "").trim() || undefined;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    redirect(
      `/projects/${projectId}/agency/documents?error=${encodeURIComponent("Aucun fichier sélectionné")}`
    );
  }

  const errors: string[] = [];
  let ok = 0;
  for (const f of files) {
    if (!f || f.size === 0) continue;
    const res = await uploadDocument(supabase, {
      userId,
      projectId,
      file: f,
      description,
      category,
    });
    if ("error" in res) errors.push(`${f.name} : ${res.error}`);
    else ok++;
  }

  revalidatePath(`/projects/${projectId}/agency/documents`);
  revalidatePath(`/projects/${projectId}/agency/onboarding`);
  if (errors.length > 0) {
    redirect(
      `/projects/${projectId}/agency/documents?error=${encodeURIComponent(
        `${ok} ok · ${errors.length} erreur(s) : ${errors.join(" ; ")}`
      )}`
    );
  }
  redirect(
    `/projects/${projectId}/agency/documents?ok=${encodeURIComponent(`${ok} document(s) uploadé(s)`)}`
  );
}

export async function deleteDocumentAction(
  projectId: string,
  documentId: string
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  await deleteDocument(supabase, { userId, id: documentId });
  revalidatePath(`/projects/${projectId}/agency/documents`);
  redirect(`/projects/${projectId}/agency/documents`);
}

export async function updateDocumentAction(
  projectId: string,
  documentId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const isActive = String(formData.get("is_active") ?? "") === "on";
  await updateDocumentMeta(supabase, {
    userId,
    id: documentId,
    description,
    category,
    isActive,
  });
  revalidatePath(`/projects/${projectId}/agency/documents`);
  redirect(`/projects/${projectId}/agency/documents`);
}

export async function toggleDocumentActiveAction(
  projectId: string,
  documentId: string,
  isActive: boolean
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  await updateDocumentMeta(supabase, {
    userId,
    id: documentId,
    isActive,
  });
  revalidatePath(`/projects/${projectId}/agency/documents`);
  redirect(`/projects/${projectId}/agency/documents`);
}
