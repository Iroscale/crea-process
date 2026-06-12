/**
 * P0.4 — Versioning des livrables.
 *
 * Toute modification d'un livrable (save manuel, application d'une version
 * issue du chat, régénération) passe par updateDeliverableVersioned() :
 *   1. snapshot de la version courante dans deliverable_versions
 *   2. update du livrable avec le nouveau contenu + version++
 *
 * Une relance complète d'étape crée un nouveau livrable avec
 * parent_deliverable_id pointant sur l'ancien (qui passe en 'archived')
 * — géré par archivePreviousDeliverable() appelé depuis runAgent.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VersionSource = "agent" | "chat" | "manual";

export interface DeliverableVersionRow {
  id: string;
  deliverable_id: string;
  version: number;
  content_md: string;
  structured: unknown;
  source: VersionSource;
  created_at: string;
}

/**
 * Met à jour le contenu d'un livrable en snapshotant l'ancienne version.
 * Retourne la nouvelle version.
 */
export async function updateDeliverableVersioned(
  supabase: SupabaseClient,
  args: {
    userId: string;
    deliverableId: string;
    newContentMd: string;
    newStructured?: unknown;
    newTitle?: string;
    source: VersionSource;
  }
): Promise<{ newVersion: number } | { error: string }> {
  const { userId, deliverableId, newContentMd, newStructured, newTitle, source } =
    args;

  // 1. Charge la version courante
  const { data: current, error: loadErr } = await supabase
    .from("deliverables")
    .select("project_id, version, content_md, structured")
    .eq("id", deliverableId)
    .maybeSingle();
  if (loadErr || !current) {
    return { error: loadErr?.message ?? "Livrable introuvable" };
  }
  const currentVersion = (current.version as number) ?? 1;

  // 2. Snapshot de l'ancienne version
  const { error: snapErr } = await supabase.from("deliverable_versions").insert({
    deliverable_id: deliverableId,
    project_id: current.project_id,
    user_id: userId,
    version: currentVersion,
    content_md: current.content_md,
    structured: current.structured ?? null,
    source,
    created_by: userId,
  });
  if (snapErr && !snapErr.message.includes("duplicate")) {
    return { error: `snapshot : ${snapErr.message}` };
  }

  // 3. Update avec version++
  const newVersion = currentVersion + 1;
  const patch: Record<string, unknown> = {
    content_md: newContentMd,
    version: newVersion,
  };
  if (newStructured !== undefined) patch.structured = newStructured;
  if (newTitle) patch.title = newTitle;
  const { error: updErr } = await supabase
    .from("deliverables")
    .update(patch)
    .eq("id", deliverableId);
  if (updErr) return { error: `update : ${updErr.message}` };

  return { newVersion };
}

/**
 * Liste les versions archivées d'un livrable (la version courante vit sur
 * la ligne deliverables elle-même).
 */
export async function listDeliverableVersions(
  supabase: SupabaseClient,
  deliverableId: string
): Promise<DeliverableVersionRow[]> {
  const { data } = await supabase
    .from("deliverable_versions")
    .select("id, deliverable_id, version, content_md, structured, source, created_at")
    .eq("deliverable_id", deliverableId)
    .order("version", { ascending: false });
  return (data ?? []) as DeliverableVersionRow[];
}

/**
 * Restaure une ancienne version = crée une NOUVELLE version avec le contenu
 * de l'ancienne (pas de réécriture d'historique).
 */
export async function restoreDeliverableVersion(
  supabase: SupabaseClient,
  args: { userId: string; deliverableId: string; versionId: string }
): Promise<{ newVersion: number } | { error: string }> {
  const { data: old } = await supabase
    .from("deliverable_versions")
    .select("content_md, structured, version")
    .eq("id", args.versionId)
    .eq("deliverable_id", args.deliverableId)
    .maybeSingle();
  if (!old) return { error: "Version introuvable" };
  return updateDeliverableVersioned(supabase, {
    userId: args.userId,
    deliverableId: args.deliverableId,
    newContentMd: old.content_md as string,
    newStructured: old.structured,
    source: "manual",
  });
}

/**
 * Archive le précédent livrable d'une étape au moment d'une relance, et
 * retourne son id pour renseigner parent_deliverable_id sur le nouveau.
 * Appelé par runAgent juste avant l'insertion du nouveau livrable.
 */
export async function archivePreviousDeliverable(
  supabase: SupabaseClient,
  args: { projectId: string; stepKey: string }
): Promise<string | null> {
  const { data: prev } = await supabase
    .from("deliverables")
    .select("id, status")
    .eq("project_id", args.projectId)
    .eq("step_key", args.stepKey)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return null;
  await supabase
    .from("deliverables")
    .update({ status: "archived" })
    .eq("id", prev.id);
  return prev.id as string;
}

/**
 * Marque le dernier livrable actif d'une étape comme 'validated'.
 * Appelé à la validation du gate (les livrables validés sont exportables
 * dans le pack client — P1.1).
 */
export async function markStepDeliverableValidated(
  supabase: SupabaseClient,
  args: { projectId: string; stepKey: string }
): Promise<void> {
  const { data: latest } = await supabase
    .from("deliverables")
    .select("id")
    .eq("project_id", args.projectId)
    .eq("step_key", args.stepKey)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await supabase
      .from("deliverables")
      .update({ status: "validated" })
      .eq("id", latest.id);
  }
}
