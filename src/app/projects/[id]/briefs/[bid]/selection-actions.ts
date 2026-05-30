"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Toggle the `selected` flag on a single image (Phase 2).
 * The user picks their winners after the 1:1 batch generation completes,
 * then operates on this selection in Phase 3 (correct text, add legal, 9:16).
 */
export async function setImageSelection(
  briefId: string,
  imageId: string,
  selected: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("generated_images")
    .update({ selected })
    .eq("id", imageId);

  if (error) throw new Error(error.message);

  // Look up the project for revalidation
  const { data: img } = await supabase
    .from("generated_images")
    .select("generation_id, generations(brief_id, briefs(project_id))")
    .eq("id", imageId)
    .maybeSingle();

  // Best-effort revalidation — selection bar reads via server fetch.
  const projectId = (
    img as
      | null
      | {
          generations: { brief_id: string; briefs: { project_id: string } };
        }
  )?.generations?.briefs?.project_id;
  if (projectId) {
    revalidatePath(`/projects/${projectId}/briefs/${briefId}`);
  }
}

/**
 * Clear the selection of all images that belong to this brief.
 */
export async function clearBriefSelection(briefId: string, projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find all image ids belonging to this brief, then unselect.
  const { data: gens } = await supabase
    .from("generations")
    .select("id")
    .eq("brief_id", briefId);
  const genIds = (gens ?? []).map((g) => g.id);
  if (genIds.length === 0) return;

  await supabase
    .from("generated_images")
    .update({ selected: false })
    .in("generation_id", genIds)
    .eq("selected", true);

  revalidatePath(`/projects/${projectId}/briefs/${briefId}`);
}

/**
 * Select / deselect all images of a given generation in one shot.
 */
export async function setGenerationSelection(
  briefId: string,
  projectId: string,
  generationId: string,
  selected: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("generated_images")
    .update({ selected })
    .eq("generation_id", generationId)
    .is("parent_image_id", null); // only act on 1:1 masters

  revalidatePath(`/projects/${projectId}/briefs/${briefId}`);
}
