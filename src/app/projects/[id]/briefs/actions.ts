"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_MODES = ["upload", "chat", "hybrid"] as const;
type Mode = (typeof ALLOWED_MODES)[number];

export async function createBrief(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const userInput = String(formData.get("user_input") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "");
  const mode: Mode = (ALLOWED_MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as Mode)
    : "chat";

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      project_id: projectId,
      user_id: user.id,
      title: title || null,
      mode,
      user_input: userInput || null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/projects/${projectId}/briefs?error=${encodeURIComponent(
        error?.message ?? "Erreur création brief"
      )}`
    );
  }

  // For chat / hybrid modes: seed an opening assistant message that drives the conversation
  if (mode === "chat" || mode === "hybrid") {
    await supabase.from("brief_messages").insert({
      brief_id: data.id,
      role: "assistant",
      content:
        userInput
          ? `Parfait, je vois que tu veux : "${userInput}".\n\nPour qu'on parte sur quelque chose de précis, j'ai besoin de quelques infos rapides :\n\n1. **À qui** s'adresse cette ad (cible précise) ?\n2. **Quelle action** doit-elle déclencher (clic, achat, inscription) ?\n3. **Le ton** que tu veux : fun, premium, choc, témoignage… ?\n4. **Une référence visuelle** en tête (style, ambiance, marque qui t'inspire) ?\n\nRéponds dans l'ordre que tu veux.`
          : "Salut ! Avant de t'aider à créer cette ad, j'ai besoin de comprendre :\n\n1. **Le produit / l'offre** précise à mettre en avant ?\n2. **À qui** s'adresse l'ad ?\n3. **L'action attendue** (clic, achat, inscription) ?\n4. **Le ton & l'ambiance** que tu veux ?\n5. **Une référence visuelle** en tête ?",
    });
  }

  revalidatePath(`/projects/${projectId}/briefs`);
  redirect(`/projects/${projectId}/briefs/${data.id}`);
}

/**
 * Delete a brief, all its children (cascade DB), AND clean up the orphan
 * storage objects (inspirations + generated images) that the SQL cascade
 * doesn't touch.
 *
 * Storage cleanup is best-effort : failures are logged but don't block the
 * row deletion. Users care about the brief disappearing from the UI ;
 * orphan files in buckets are tolerable (we can sweep them later).
 */
export async function deleteBrief(projectId: string, briefId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify ownership before any destructive operation
  const { data: brief } = await supabase
    .from("briefs")
    .select("id, project_id, user_id")
    .eq("id", briefId)
    .maybeSingle();
  if (!brief || brief.user_id !== user.id || brief.project_id !== projectId) {
    redirect(
      `/projects/${projectId}/briefs?error=${encodeURIComponent(
        "Brief introuvable ou accès refusé"
      )}`
    );
  }

  // ── 1) Collect storage paths BEFORE deleting the rows (FKs cascade after) ──
  const { data: inspirations } = await supabase
    .from("brief_inspirations")
    .select("storage_path")
    .eq("brief_id", briefId);
  const inspirationPaths = (inspirations ?? [])
    .map((r) => r.storage_path)
    .filter((p): p is string => Boolean(p));

  // generated_images live behind generations.brief_id — fetch via join
  const { data: gens } = await supabase
    .from("generations")
    .select("id")
    .eq("brief_id", briefId);
  const genIds = (gens ?? []).map((g) => g.id);

  let generatedPaths: string[] = [];
  if (genIds.length > 0) {
    const { data: imgs } = await supabase
      .from("generated_images")
      .select("storage_path")
      .in("generation_id", genIds);
    generatedPaths = (imgs ?? [])
      .map((r) => r.storage_path)
      .filter((p): p is string => Boolean(p));
  }

  // ── 2) Delete the brief row — cascades to messages, inspirations,
  //       generations, generated_images (per FK ON DELETE CASCADE in schema). ──
  const { error: dbErr } = await supabase
    .from("briefs")
    .delete()
    .eq("id", briefId);
  if (dbErr) {
    redirect(
      `/projects/${projectId}/briefs?error=${encodeURIComponent(
        `Suppression : ${dbErr.message}`
      )}`
    );
  }

  // ── 3) Best-effort storage cleanup (after DB success) ──────────────────
  if (inspirationPaths.length > 0) {
    await supabase.storage
      .from("inspirations")
      .remove(inspirationPaths)
      .catch(() => {
        // ignore — orphan files are tolerable, the row is gone
      });
  }
  if (generatedPaths.length > 0) {
    await supabase.storage
      .from("generated")
      .remove(generatedPaths)
      .catch(() => {
        // ignore — same rationale
      });
  }

  revalidatePath(`/projects/${projectId}/briefs`);
}
