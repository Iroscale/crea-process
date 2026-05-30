"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

Tu produis :
1. Un patch markdown pour client-profile.md (sections fixes du schéma).
2. Une v0 de brand-voice.md (à affiner par copywriter plus tard).
3. Une entrée pour decisions-log.md.
4. La liste des manques à combler avant l'étape 1.`;

  const result = await runAgent({
    supabase,
    userId,
    projectId,
    agentKey: "orchestrator",
    stepKey: "onboarding",
    task,
    deliverable: {
      kind: "onboarding-synthesis",
      title: `📥 Synthèse d'onboarding · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
    },
    gateOverride: false,
  });

  if (result.status === "failed") {
    redirect(
      `/projects/${projectId}/agency/onboarding?error=${encodeURIComponent(
        result.errorMessage ?? "Erreur orchestrator"
      )}`
    );
  }

  revalidatePath(`/projects/${projectId}/agency`);
  revalidatePath(`/projects/${projectId}/agency/onboarding`);
  redirect(`/projects/${projectId}/agency/onboarding?ingested=1`);
}

function buildOnboardingBlob(args: {
  vertical: string;
  od: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  const { vertical, od } = args;
  lines.push(`Verticale : ${vertical}`);
  if (od.marche) lines.push(`Marché : ${od.marche}`);
  if (od.contact_op) lines.push(`Contact opérationnel : ${od.contact_op}`);
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
