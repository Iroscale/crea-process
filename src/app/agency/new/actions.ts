"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activateAgencyOS } from "@/lib/agency";

/**
 * Wizard "Nouveau client" — 1 formulaire qui :
 *  1. Crée le projet
 *  2. Active Agency OS (verticale)
 *  3. Sauvegarde onboarding_data (marché, contact, LP URLs, contraintes, récap Fathom)
 *  4. Redirige soit vers onboarding (si fathom_recap manquant) soit vers
 *     l'étape 01-market-research (si onboarding suffisamment rempli)
 *
 * En option : déclenche l'ingestion automatique par l'orchestrator (case à
 * cocher "ingest_now"). Sinon le user déclenche depuis la page onboarding.
 */
export async function createClientAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Champs identité projet ──
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect(`/agency/new?error=${encodeURIComponent("Nom client requis")}`);
  }

  // ── Champs onboarding ──
  const vertical = String(formData.get("vertical") ?? "").trim() || null;
  const marche = String(formData.get("marche") ?? "").trim();
  const contact_op = String(formData.get("contact_op") ?? "").trim();

  // ⭐ Mission — non négociable
  const business_model = String(formData.get("business_model") ?? "").trim();
  const objectif_principal = String(formData.get("objectif_principal") ?? "").trim();
  const cible_precise = String(formData.get("cible_precise") ?? "").trim();
  const action_recherchee = String(formData.get("action_recherchee") ?? "").trim();
  const stade_marche = String(formData.get("stade_marche") ?? "").trim();

  const lp_urls = String(formData.get("lp_urls") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const contraintes_regle = String(formData.get("contraintes_regle") ?? "").trim();
  const contraintes_ops = String(formData.get("contraintes_ops") ?? "").trim();
  const contraintes_ton = String(formData.get("contraintes_ton") ?? "").trim();
  const fathom_recap = String(formData.get("fathom_recap") ?? "").trim();
  const docs_summary = String(formData.get("docs_summary") ?? "").trim();
  const ingest_now = String(formData.get("ingest_now") ?? "") === "on";

  // ─── 1. Création projet ──────────────────────────────────────────────────
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      description,
    })
    .select("id")
    .single();
  if (projErr || !proj) {
    redirect(
      `/agency/new?error=${encodeURIComponent(
        projErr?.message ?? "Création projet échouée"
      )}`
    );
  }
  const projectId = proj.id as string;

  // ─── 2. Activation Agency OS ─────────────────────────────────────────────
  const actRes = await activateAgencyOS({
    supabase,
    userId: user.id,
    projectId,
    vertical: vertical ?? undefined,
  });
  if ("error" in actRes) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(actRes.error)}`
    );
  }

  // ─── 3. Sauvegarde onboarding_data ───────────────────────────────────────
  const hasAnyOnboarding =
    marche || contact_op || lp_urls.length > 0 || contraintes_regle ||
    contraintes_ops || contraintes_ton || fathom_recap || docs_summary ||
    business_model || objectif_principal || cible_precise || action_recherchee ||
    stade_marche;

  const hasMission =
    business_model || objectif_principal || cible_precise || action_recherchee;

  if (hasAnyOnboarding || hasMission) {
    const onboarding_data = {
      marche,
      contact_op,
      mission: {
        business_model,
        objectif_principal,
        cible_precise,
        action_recherchee,
        stade_marche,
      },
      lp_urls,
      access: { bm: "", google_ads: "", page_fb: "", pixel: "" },
      contraintes: {
        reglementaires: contraintes_regle,
        operationnelles: contraintes_ops,
        tonales: contraintes_ton,
      },
      fathom_recap,
      docs_summary,
    };
    await supabase
      .from("client_agency_profile")
      .update({ onboarding_data })
      .eq("project_id", projectId);
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}/agency`);

  // ─── 4. Redirection intelligente ─────────────────────────────────────────
  // - Si ingest_now coché : on lance l'ingestion immédiatement (page onboarding gère ça)
  // - Sinon : si onboarding rempli substantiellement → onboarding pour finir
  //          ou directement étape 01 si fathom_recap renseigné
  if (ingest_now && fathom_recap.length > 50) {
    // Note : on passe par /onboarding qui a déjà l'action ingestOnboardingAction
    // accessible via le formulaire. On va plutôt rediriger vers onboarding avec
    // un flag qui suggère de lancer.
    redirect(`/projects/${projectId}/agency/onboarding?ready_to_ingest=1`);
  }

  if (fathom_recap.length > 100 || docs_summary.length > 100) {
    redirect(
      `/projects/${projectId}/agency/onboarding?just_created=1`
    );
  }

  redirect(`/projects/${projectId}/agency?welcome=1`);
}
