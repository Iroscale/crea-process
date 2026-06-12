"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activateAgencyOS } from "@/lib/agency";
import {
  STEP_BY_KEY,
  getNextStep,
  applyDeliverableToMemory,
  type StepKey,
} from "@/lib/agency";

async function loadUserOr401() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

// ── Activation ────────────────────────────────────────────────────────────
export async function activateAction(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const vertical = String(formData.get("vertical") ?? "").trim() || undefined;

  const res = await activateAgencyOS({ supabase, userId, projectId, vertical });
  if ("error" in res) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(res.error)}`
    );
  }
  revalidatePath(`/projects/${projectId}/agency`);
  redirect(`/projects/${projectId}/agency`);
}

// ── Validation d'un gate (étape en gate_pending → validated) ─────────────
export async function validateGateAction(
  projectId: string,
  stepKey: StepKey,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  if (!STEP_BY_KEY[stepKey]) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(
        `Étape inconnue : ${stepKey}`
      )}`
    );
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await supabase
    .from("pipeline_steps")
    .update({
      status: "validated",
      validated_at: new Date().toISOString(),
      validated_by: userId,
      notes,
    })
    .eq("project_id", projectId)
    .eq("step_key", stepKey);
  revalidatePath(`/projects/${projectId}/agency`);
  redirect(`/projects/${projectId}/agency`);
}

// ── P0.1 : Validation gate + application du livrable en mémoire ─────────
/**
 * Valide le gate ET applique le livrable dans client_memory[memorySlug].
 * Utilisé par la page preview /agency/steps/[step]/apply après que
 * l'opérateur a vu le diff. Snapshot historique automatique.
 */
export async function validateApplyAndContinueAction(
  projectId: string,
  stepKey: StepKey,
  deliverableId: string,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  const step = STEP_BY_KEY[stepKey];
  if (!step?.memorySlug) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
        "Cette étape n'alimente pas la mémoire"
      )}`
    );
  }

  // 1. Charge le livrable
  const { data: deliv } = await supabase
    .from("deliverables")
    .select("id, content_md")
    .eq("id", deliverableId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!deliv) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}?error=${encodeURIComponent(
        "Livrable introuvable"
      )}`
    );
  }

  // 2. Applique en mémoire (snapshot + version++)
  const applied = await applyDeliverableToMemory(supabase, {
    userId,
    projectId,
    slug: step.memorySlug,
    deliverableId,
    contentMd: deliv.content_md as string,
  });
  if ("error" in applied) {
    redirect(
      `/projects/${projectId}/agency/steps/${stepKey}/apply?error=${encodeURIComponent(
        applied.error
      )}`
    );
  }

  // 3. Valide le gate
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await supabase
    .from("pipeline_steps")
    .update({
      status: "validated",
      validated_at: new Date().toISOString(),
      validated_by: userId,
      notes:
        notes ??
        `mémoire ${step.memorySlug} mise à jour (v${applied.newVersion})`,
    })
    .eq("project_id", projectId)
    .eq("step_key", stepKey);

  revalidatePath(`/projects/${projectId}/agency`);
  revalidatePath(`/projects/${projectId}/agency/memory`);

  // 4. Continue vers l'étape suivante
  const next = getNextStep(stepKey);
  if (!next) {
    redirect(
      `/projects/${projectId}/agency?ok=${encodeURIComponent(
        `Étape validée — mémoire ${step.memorySlug} v${applied.newVersion}`
      )}`
    );
  }
  const nextHref =
    next.key === "export-memory"
      ? `/projects/${projectId}/agency/export`
      : next.key === "retrospective"
        ? `/projects/${projectId}/agency/retrospective`
        : next.key === "onboarding"
          ? `/projects/${projectId}/agency/onboarding`
          : `/projects/${projectId}/agency/steps/${next.key}`;
  redirect(nextHref);
}

// ── Validation gate ET passage à l'étape suivante (1 clic) ──────────────
export async function validateAndContinueAction(
  projectId: string,
  stepKey: StepKey,
  formData: FormData
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  if (!STEP_BY_KEY[stepKey]) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(
        `Étape inconnue : ${stepKey}`
      )}`
    );
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await supabase
    .from("pipeline_steps")
    .update({
      status: "validated",
      validated_at: new Date().toISOString(),
      validated_by: userId,
      notes,
    })
    .eq("project_id", projectId)
    .eq("step_key", stepKey);
  revalidatePath(`/projects/${projectId}/agency`);
  const next = getNextStep(stepKey);
  if (!next) {
    redirect(`/projects/${projectId}/agency?ok=${encodeURIComponent("Étape validée — pipeline terminé !")}`);
  }
  const nextHref =
    next.key === "export-memory"
      ? `/projects/${projectId}/agency/export`
      : next.key === "retrospective"
        ? `/projects/${projectId}/agency/retrospective`
        : next.key === "onboarding"
          ? `/projects/${projectId}/agency/onboarding`
          : `/projects/${projectId}/agency/steps/${next.key}`;
  redirect(nextHref);
}

// ── Skip une étape ────────────────────────────────────────────────────────
export async function skipStepAction(
  projectId: string,
  stepKey: StepKey
): Promise<void> {
  const { supabase, userId } = await loadUserOr401();
  if (!STEP_BY_KEY[stepKey]) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(
        `Étape inconnue : ${stepKey}`
      )}`
    );
  }
  await supabase
    .from("pipeline_steps")
    .update({
      status: "skipped",
      validated_at: new Date().toISOString(),
      validated_by: userId,
    })
    .eq("project_id", projectId)
    .eq("step_key", stepKey);
  revalidatePath(`/projects/${projectId}/agency`);
  const next = getNextStep(stepKey);
  if (!next) {
    redirect(`/projects/${projectId}/agency`);
  }
  const nextHref =
    next.key === "export-memory"
      ? `/projects/${projectId}/agency/export`
      : next.key === "retrospective"
        ? `/projects/${projectId}/agency/retrospective`
        : next.key === "onboarding"
          ? `/projects/${projectId}/agency/onboarding`
          : `/projects/${projectId}/agency/steps/${next.key}`;
  redirect(nextHref);
}

// ── Reset d'une étape (todo) ──────────────────────────────────────────────
export async function resetStepAction(
  projectId: string,
  stepKey: StepKey
): Promise<void> {
  const { supabase } = await loadUserOr401();
  if (!STEP_BY_KEY[stepKey]) {
    redirect(
      `/projects/${projectId}/agency?error=${encodeURIComponent(
        `Étape inconnue : ${stepKey}`
      )}`
    );
  }
  await supabase
    .from("pipeline_steps")
    .update({
      status: "todo",
      current_run_id: null,
      validated_at: null,
      validated_by: null,
      notes: null,
    })
    .eq("project_id", projectId)
    .eq("step_key", stepKey);
  revalidatePath(`/projects/${projectId}/agency`);
  redirect(`/projects/${projectId}/agency`);
}
