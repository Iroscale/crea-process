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

/**
 * Lance un check de conformité à la demande.
 *  - asset_kind : copy-video | copy-image | landing-page | quiz | script | email
 *  - asset_ref  : id facultatif du brief / deliverable / lp
 *  - content    : le markdown à vérifier
 *
 * Persiste le résultat (verdict + corrections) dans compliance_checks et
 * appelle aussi runAgent pour avoir un agent_run tracké.
 */
export async function runComplianceCheckAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();

  const assetKind = String(formData.get("asset_kind") ?? "").trim();
  const assetRef = String(formData.get("asset_ref") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "").trim();
  if (!assetKind || !content) {
    redirect(
      `/projects/${projectId}/agency/compliance?error=${encodeURIComponent(
        "asset_kind et content requis"
      )}`
    );
  }

  const task = `Asset à vérifier.

## Type : ${assetKind}
${assetRef ? `## Réf : ${assetRef}\n` : ""}
## Contenu

${content}

Rends ton verdict selon le format imposé.`;

  const result = await runAgent({
    supabase,
    userId,
    projectId,
    agentKey: "legal-compliance",
    stepKey: "compliance-check", // step "virtuel" hors pipeline
    task,
    deliverable: {
      kind: "compliance-check",
      title: `⚖️ Check ${assetKind} · ${new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
    },
    gateOverride: false,
    updatePipelineStep: false, // compliance check n'est PAS dans le pipeline standard
  });

  if (result.status === "failed") {
    redirect(
      `/projects/${projectId}/agency/compliance?error=${encodeURIComponent(
        result.errorMessage ?? "Erreur legal-compliance"
      )}`
    );
  }

  // Parse rough du verdict + correction depuis le markdown produit
  const text = result.text;
  const verdict = parseVerdict(text);
  const correctedVersion = parseSection(text, "Version corrigée intégrale");
  const corrections = parseSection(text, "Issues identifiées");
  const referencesUsed = parseSection(text, "Référentiels mobilisés");

  await supabase.from("compliance_checks").insert({
    project_id: projectId,
    user_id: userId,
    asset_kind: assetKind,
    asset_ref: assetRef,
    asset_content_md: content,
    verdict,
    issues: null,
    corrections_md: corrections,
    corrected_version_md: correctedVersion,
    references_used: referencesUsed
      ? { raw: referencesUsed }
      : null,
    run_id: result.runId,
  });

  revalidatePath(`/projects/${projectId}/agency/compliance`);
  redirect(
    `/projects/${projectId}/agency/compliance?ok=${encodeURIComponent(
      `Check ${verdict} enregistré`
    )}`
  );
}

function parseVerdict(text: string): "ok" | "partial" | "nok" {
  const lower = text.toLowerCase();
  // Cherche une ligne "## Verdict ..."
  const m = lower.match(/##\s*verdict[^\n]*?([✅⚠️❌])?\s*(ok|partial|nok)/);
  if (m && (m[2] === "ok" || m[2] === "partial" || m[2] === "nok")) {
    return m[2] as "ok" | "partial" | "nok";
  }
  if (lower.includes("verdict") && lower.includes("nok")) return "nok";
  if (lower.includes("verdict") && lower.includes("partial")) return "partial";
  if (lower.includes("verdict") && lower.includes("ok")) return "ok";
  return "partial";
}

function parseSection(text: string, heading: string): string | null {
  const safeHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`##\\s*${safeHeading}([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = text.match(re);
  if (!m) return null;
  return m[1].trim();
}
