/**
 * P0.1 — Application d'un livrable validé dans la mémoire client.
 *
 * Flux : à la validation du gate d'une étape qui a un `memorySlug`
 * (onboarding → client-profile, 01 → icp, 02 → angles-promesses),
 * l'opérateur voit un preview diff (mémoire actuelle vs livrable) puis
 * choisit « Valider & appliquer » ou « Valider sans appliquer ».
 *
 * v1 volontairement simple : l'application = remplacement complet du
 * fichier mémoire par le livrable (les agents produisent déjà le fichier
 * entier selon le schéma .claude/memory-schema.md). Pas de moteur de patch.
 * On retire juste la section « ## Validation requise » (artefact de gate
 * qui n'a pas sa place en mémoire).
 *
 * Sécurités :
 *  - snapshot de l'ancienne version dans client_memory_history avant écrasement
 *  - version++ sur client_memory
 *  - applied_to_memory_at + memory_slug renseignés sur le livrable
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorySlug } from "@/lib/agents";

/**
 * Nettoie le livrable avant application en mémoire : retire la section
 * « ## Validation requise » (et tout ce qui la suit jusqu'à la prochaine
 * section de même niveau ou la fin) — c'est un artefact de gate destiné
 * à l'opérateur, pas au contexte des agents aval.
 */
export function cleanDeliverableForMemory(contentMd: string): string {
  // Coupe la section "## Validation requise" jusqu'au prochain "## " ou EOF.
  const cleaned = contentMd.replace(
    /\n##\s+Validation requise[\s\S]*?(?=\n##\s|$)/i,
    "\n"
  );
  return cleaned.trim() + "\n";
}

export interface ApplyResult {
  newVersion: number;
}

/**
 * Applique le contenu d'un livrable dans client_memory[slug].
 * Retourne la nouvelle version, ou une erreur.
 */
export async function applyDeliverableToMemory(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    slug: MemorySlug;
    deliverableId: string;
    contentMd: string;
  }
): Promise<ApplyResult | { error: string }> {
  const { userId, projectId, slug, deliverableId, contentMd } = args;
  const newContent = cleanDeliverableForMemory(contentMd);
  if (!newContent.trim()) {
    return { error: "Livrable vide — rien à appliquer." };
  }

  // 1. Charge la version actuelle
  const { data: current } = await supabase
    .from("client_memory")
    .select("content_md, version")
    .eq("project_id", projectId)
    .eq("slug", slug)
    .maybeSingle();
  const currentVersion = (current?.version as number) ?? 0;
  const currentContent = (current?.content_md as string) ?? "";

  // 2. Snapshot de l'ancienne version (si elle existait et n'était pas vide)
  if (currentVersion >= 1 && currentContent.trim()) {
    const { error: histErr } = await supabase
      .from("client_memory_history")
      .insert({
        project_id: projectId,
        user_id: userId,
        slug,
        version: currentVersion,
        content_md: currentContent,
        replaced_by_deliverable_id: deliverableId,
      });
    if (histErr) return { error: `snapshot historique : ${histErr.message}` };
  }

  // 3. Upsert la nouvelle version
  const newVersion = currentVersion + 1;
  const { error: upsertErr } = await supabase.from("client_memory").upsert(
    {
      project_id: projectId,
      user_id: userId,
      slug,
      content_md: newContent,
      version: newVersion,
      updated_by: userId,
    },
    { onConflict: "project_id,slug" }
  );
  if (upsertErr) return { error: `écriture mémoire : ${upsertErr.message}` };

  // 4. Marque le livrable comme appliqué
  await supabase
    .from("deliverables")
    .update({
      memory_slug: slug,
      applied_to_memory_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);

  return { newVersion };
}
