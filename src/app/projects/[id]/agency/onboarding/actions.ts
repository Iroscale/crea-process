"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agents";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/** Sauvegarde les données d'onboarding (jsonb) + vertical. */
export async function saveOnboardingAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase } = await loadUserOr401();

  const vertical = String(formData.get("vertical") ?? "").trim() || null;
  const marche = String(formData.get("marche") ?? "").trim();
  const contact_op = String(formData.get("contact_op") ?? "").trim();

  // ⭐ Mission de l'agence — signaux non négociables
  const business_model = String(formData.get("business_model") ?? "").trim();
  const objectif_principal = String(formData.get("objectif_principal") ?? "").trim();
  const cible_precise = String(formData.get("cible_precise") ?? "").trim();
  const action_recherchee = String(formData.get("action_recherchee") ?? "").trim();
  const stade_marche = String(formData.get("stade_marche") ?? "").trim();

  const lp_urls = String(formData.get("lp_urls") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const access_bm = String(formData.get("access_bm") ?? "").trim();
  const access_google = String(formData.get("access_google") ?? "").trim();
  const access_page = String(formData.get("access_page") ?? "").trim();
  const access_pixel = String(formData.get("access_pixel") ?? "").trim();
  const contraintes_regle = String(formData.get("contraintes_regle") ?? "").trim();
  const contraintes_ops = String(formData.get("contraintes_ops") ?? "").trim();
  const contraintes_ton = String(formData.get("contraintes_ton") ?? "").trim();
  const fathom_recap = String(formData.get("fathom_recap") ?? "").trim();
  const docs_summary = String(formData.get("docs_summary") ?? "").trim();

  const onboarding_data = {
    marche,
    contact_op,
    // ⭐ Mission
    mission: {
      business_model,
      objectif_principal,
      cible_precise,
      action_recherchee,
      stade_marche,
    },
    lp_urls,
    access: {
      bm: access_bm,
      google_ads: access_google,
      page_fb: access_page,
      pixel: access_pixel,
    },
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
    .update({
      vertical,
      onboarding_data,
    })
    .eq("project_id", projectId);

  revalidatePath(`/projects/${projectId}/agency/onboarding`);
  redirect(`/projects/${projectId}/agency/onboarding?saved=1`);
}

/**
 * Construit le bloc onboarding à partir des onboarding_data + lance
 * l'orchestrator (étape onboarding). Produit un livrable client-profile.
 */
export async function ingestOnboardingAction(
  projectId: string
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const { data: profile } = await supabase
    .from("client_agency_profile")
    .select("vertical, onboarding_data")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!profile) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent("Agency OS pas activé")}`
    );
  }

  const od = (profile.onboarding_data as Record<string, unknown>) ?? {};
  const blob = buildOnboardingBlob({
    vertical: (profile.vertical as string) ?? "—",
    od,
  });

  const task = `Intention : ingest-onboarding.

# Bloc onboarding fourni par l'équipe

${blob}

# Instructions de calibration

La section « ⭐ MISSION DE L'AGENCE » en tête du blob est la **boussole**.

- Si **Type de business = B2B** : tous les ICP, angles, hooks, copies en
  aval doivent s'adresser à des **décideurs en entreprise** (fonction,
  secteur, taille). Le langage est celui d'un pair, pas d'un consommateur.
  Pas de « vous et votre famille » — on parle de « votre boîte »,
  « votre dirigeant », « vos équipes ».
- Si **Type de business = B2C** : on parle au particulier sur son
  patrimoine, son projet de vie, ses risques personnels.
- Si **B2B2C** : tu identifies clairement les **2 cibles distinctes**
  (le distributeur B2B + l'utilisateur final B2C) et tu structures
  l'ICP comme tel.
- Si **manquant ou ⚠** : tu **n'inventes pas** — tu mets la question
  explicite dans la section « Manques à combler ».

L'**Action recherchée** conditionne la LP, le quiz, le CTA. Si c'est
« prise de RDV », pas de simulateur. Si c'est « inscription
simulateur », pas de RDV.

# Livrables

1. Un patch markdown pour **client-profile.md** :
   - **Première section** : reprends EXACTEMENT les 5 lignes de la Mission
     (Type de business, Objectif, Cible précise, Action recherchée, Stade
     marché). C'est la première chose que tous les agents liront.
   - Puis les autres sections du schéma.
2. Une v0 de **brand-voice.md** (à affiner par copywriter plus tard).
   Si B2B, le registre par défaut est « pair à pair décideur ». Si B2C,
   le registre par défaut suit la verticale (souvent « pédagogue posé »
   pour le finance régulé).
3. Une entrée pour **decisions-log.md** mentionnant le type de business
   et l'objectif.
4. La liste des **manques à combler** avant de lancer l'étape 1 — sois
   strict : si la cible précise n'est pas définie, on ne lance pas le
   market research.`;

  // ─── Exécution asynchrone (même pattern que launchStepAction / P0.6) ────
  // Anti double-submit : si une ingestion tourne déjà, on refuse.
  const { data: alreadyRunning } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("step_key", "onboarding")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (alreadyRunning) {
    redirect(
      `/projects/${projectId}/agency/onboarding?error=${encodeURIComponent(
        "L'orchestrator travaille déjà sur l'ingestion — attends la fin du run en cours."
      )}`
    );
  }

  // Crée la ligne agent_runs AVANT le redirect pour permettre le polling.
  const { data: runRow, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      step_key: "onboarding",
      agent_key: "orchestrator",
      model: "(résolution en cours)",
      status: "running",
      input_snapshot: { task },
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    redirect(
      `/projects/${projectId}/agency/onboarding?error=${encodeURIComponent(
        runErr?.message ?? "Création du run impossible"
      )}`
    );
  }
  const runId = runRow.id as string;

  const deliverableTitle = `📥 Synthèse d'onboarding · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  after(async () => {
    try {
      await runAgent({
        supabase,
        userId,
        projectId,
        agentKey: "orchestrator",
        stepKey: "onboarding",
        task,
        deliverable: {
          kind: "onboarding-synthesis",
          title: deliverableTitle,
        },
        gateOverride: false,
        existingRunId: runId,
      });
    } catch (e) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: (e as Error).message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
  });

  revalidatePath(`/projects/${projectId}/agency`);
  revalidatePath(`/projects/${projectId}/agency/onboarding`);
  redirect(`/projects/${projectId}/agency/onboarding?ingesting=1`);
}

function buildOnboardingBlob(args: {
  vertical: string;
  od: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  const { vertical, od } = args;
  const mission = (od.mission ?? {}) as Record<string, string>;

  // ⭐ Mission de l'agence — EN TÊTE, en majuscules, signaux non négociables
  // pour que l'orchestrator (et tous les agents en aval) calibrent
  // correctement B2B vs B2C, l'objectif, la cible.
  lines.push("# ⭐ MISSION DE L'AGENCE — À LIRE EN PREMIER");
  lines.push("");
  lines.push(
    "> Ces 5 signaux conditionnent TOUS les livrables en aval (market research, " +
      "angles, copy, LP, campagnes). Ne les confonds pas. Si l'un manque, signale-le " +
      "explicitement dans la section « Manques à combler » de ta synthèse — " +
      "ne devine pas."
  );
  lines.push("");
  lines.push(
    `- **Type de business** : ${mission.business_model || "⚠ NON PRÉCISÉ — DEMANDER AU CLIENT"}`
  );
  lines.push(
    `- **Objectif principal** : ${mission.objectif_principal || "⚠ NON PRÉCISÉ"}`
  );
  lines.push(
    `- **Cible précise** : ${mission.cible_precise || "⚠ NON PRÉCISÉ"}`
  );
  lines.push(
    `- **Action recherchée** : ${mission.action_recherchee || "⚠ NON PRÉCISÉ"}`
  );
  lines.push(
    `- **Stade marché** : ${mission.stade_marche || "non précisé"}`
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Identité");
  lines.push(`- Verticale : ${vertical}`);
  if (od.marche) lines.push(`- Marché : ${od.marche}`);
  if (od.contact_op) lines.push(`- Contact opérationnel : ${od.contact_op}`);

  if (Array.isArray(od.lp_urls) && od.lp_urls.length > 0) {
    lines.push("\n## Landing pages actuelles");
    for (const u of od.lp_urls as string[]) lines.push(`- ${u}`);
  }
  const access = od.access as Record<string, string> | undefined;
  if (access && Object.values(access).some((v) => v && v.length > 0)) {
    lines.push("\n## Accès");
    if (access.bm) lines.push(`- BM Meta : ${access.bm}`);
    if (access.google_ads) lines.push(`- Google Ads : ${access.google_ads}`);
    if (access.page_fb) lines.push(`- Page FB : ${access.page_fb}`);
    if (access.pixel) lines.push(`- Pixel : ${access.pixel}`);
  }
  const cts = od.contraintes as Record<string, string> | undefined;
  if (cts && Object.values(cts).some((v) => v && v.length > 0)) {
    lines.push("\n## Contraintes");
    if (cts.reglementaires)
      lines.push(`### Réglementaires\n${cts.reglementaires}`);
    if (cts.operationnelles)
      lines.push(`### Opérationnelles\n${cts.operationnelles}`);
    if (cts.tonales) lines.push(`### Tonales\n${cts.tonales}`);
  }
  if (od.docs_summary) {
    lines.push("\n## Documents transmis (synthèse)");
    lines.push(String(od.docs_summary));
  }
  if (od.fathom_recap) {
    lines.push("\n## Récap Fathom (appel d'onboarding)");
    lines.push(String(od.fathom_recap));
  }
  return lines.join("\n");
}
