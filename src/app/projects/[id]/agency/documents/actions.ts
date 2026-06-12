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
  const isCore = String(formData.get("is_core") ?? "") === "on";
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  // L'upload peut venir de la page documents OU de l'onboarding —
  // on redirige vers la page d'origine (whitelistée).
  const returnTo =
    String(formData.get("return_to") ?? "") === "onboarding"
      ? `/projects/${projectId}/agency/onboarding`
      : `/projects/${projectId}/agency/documents`;
  const errParam = returnTo.includes("onboarding") ? "error" : "error";
  const okParam = returnTo.includes("onboarding") ? "docs_ok" : "ok";

  if (files.length === 0) {
    redirect(
      `${returnTo}?${errParam}=${encodeURIComponent("Aucun fichier sélectionné")}`
    );
  }

  const errors: string[] = [];
  let ok = 0;
  const uploadedIds: string[] = [];
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
    else {
      ok++;
      uploadedIds.push(res.id);
    }
  }

  // P0.7 : flag cœur appliqué à tous les fichiers de cet upload
  if (isCore && uploadedIds.length > 0) {
    for (const docId of uploadedIds) {
      await updateDocumentMeta(supabase, {
        userId,
        id: docId,
        isCore: true,
      });
    }
  }

  revalidatePath(`/projects/${projectId}/agency/documents`);
  revalidatePath(`/projects/${projectId}/agency/onboarding`);
  if (errors.length > 0) {
    redirect(
      `${returnTo}?${errParam}=${encodeURIComponent(
        `${ok} ok · ${errors.length} erreur(s) : ${errors.join(" ; ")}`
      )}`
    );
  }
  redirect(
    `${returnTo}?${okParam}=${encodeURIComponent(
      `${ok} document(s) uploadé(s)${isCore ? " (marqués cœur — injectés en entier)" : ""}`
    )}`
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

/** P0.7 : marque/démarque un document comme CŒUR (injecté en entier). */
export async function toggleDocumentCoreAction(
  projectId: string,
  documentId: string,
  isCore: boolean
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  await updateDocumentMeta(supabase, {
    userId,
    id: documentId,
    isCore,
  });
  revalidatePath(`/projects/${projectId}/agency/documents`);
  redirect(`/projects/${projectId}/agency/documents`);
}
