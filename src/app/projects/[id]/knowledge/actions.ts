"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/extract-text";
import { analyzeAdImage } from "@/lib/analyze-ad-image";
import {
  structureKnowledgeFromFiles,
  applyChatTurnToKnowledge,
  type KnowledgeFileExtract,
} from "@/lib/structure-knowledge";
import type { StructuredKnowledge } from "@/lib/structured-knowledge-schema";

const ALLOWED_KINDS = [
  "product_doc",
  "copywriting_doc",
  "past_ad",
  "script",
  "other",
] as const;

type Kind = (typeof ALLOWED_KINDS)[number];

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function uploadKnowledgeFiles(
  projectId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify project ownership (RLS will also enforce, but fail fast)
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        "Projet introuvable"
      )}`
    );
  }

  const kindRaw = String(formData.get("kind") ?? "other");
  const kind: Kind = (ALLOWED_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as Kind)
    : "other";

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        "Aucun fichier sélectionné"
      )}`
    );
  }

  const errors: string[] = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const cleanName = safeName(file.name);
      const storagePath = `${user.id}/${projectId}/${Date.now()}_${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from("knowledge")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      let extractedText: string | null = null;
      if ((file.type || "").startsWith("image/")) {
        // Image → vision analysis
        try {
          extractedText = await analyzeAdImage(buffer, file.type);
        } catch (visionErr) {
          console.error("vision analysis failed", visionErr);
          extractedText = null;
        }
      } else {
        const { text, truncated } = await extractText(
          buffer,
          file.type || "",
          file.name
        );
        extractedText = text
          ? truncated
            ? text + "\n\n[…] (contenu tronqué)"
            : text
          : null;
      }

      const { error: insertError } = await supabase
        .from("knowledge_files")
        .insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
          kind,
          extracted_text: extractedText,
        });

      if (insertError) {
        errors.push(`${file.name}: ${insertError.message}`);
      }
    } catch (err) {
      errors.push(`${file.name}: ${(err as Error).message}`);
    }
  }

  revalidatePath(`/projects/${projectId}/knowledge`);

  if (errors.length > 0) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        errors.join(" • ")
      )}`
    );
  }
}

export async function deleteKnowledgeFile(
  projectId: string,
  fileId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: file } = await supabase
    .from("knowledge_files")
    .select("storage_path, project_id")
    .eq("id", fileId)
    .maybeSingle();

  if (file?.storage_path) {
    await supabase.storage.from("knowledge").remove([file.storage_path]);
  }

  await supabase.from("knowledge_files").delete().eq("id", fileId);

  revalidatePath(`/projects/${projectId}/knowledge`);
}

/**
 * Read all knowledge files + project metadata for a project. Reused by both
 * structureProjectKnowledge and sendKnowledgeChatMessage.
 */
async function loadProjectAndKnowledge(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Base project query — works even if migration 010 isn't applied.
  const { data: baseProject } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("id", projectId)
    .maybeSingle();
  if (!baseProject) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        "Projet introuvable"
      )}`
    );
  }
  // Optional column — degrades gracefully if migration not applied.
  let structured_knowledge: unknown = null;
  {
    const { data, error } = await supabase
      .from("projects")
      .select("structured_knowledge")
      .eq("id", projectId)
      .maybeSingle();
    if (error) {
      redirect(
        `/projects/${projectId}/knowledge?error=${encodeURIComponent(
          "Migration manquante : applique supabase/migrations/010_project_knowledge_structure.sql avant d'utiliser cette fonctionnalité."
        )}`
      );
    }
    structured_knowledge = data?.structured_knowledge ?? null;
  }
  const project = { ...baseProject, structured_knowledge };

  const { data: rawFiles } = await supabase
    .from("knowledge_files")
    .select("file_name, kind, extracted_text")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const files: KnowledgeFileExtract[] = (rawFiles ?? []).map((f) => ({
    file_name: f.file_name,
    kind: f.kind,
    extracted_text: f.extracted_text,
  }));

  return { supabase, project, files };
}

/**
 * Run the first-pass (or re-run) structuring : Claude reads ALL knowledge
 * files and produces a condensed structured product brief, persisted to
 * `projects.structured_knowledge`. Re-running replaces the previous brief
 * but preserves the user's notes if they've added some via chat.
 */
export async function structureProjectKnowledge(projectId: string) {
  const { supabase, project, files } = await loadProjectAndKnowledge(projectId);

  if (files.length === 0 || files.every((f) => !f.extracted_text)) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        "Dépose au moins un document texte exploitable avant de structurer."
      )}`
    );
  }

  let result: StructuredKnowledge;
  try {
    result = await structureKnowledgeFromFiles({
      projectName: project.name,
      projectDescription: project.description,
      files,
    });
  } catch (e) {
    redirect(
      `/projects/${projectId}/knowledge?error=${encodeURIComponent(
        (e as Error).message
      )}`
    );
  }

  // Preserve any user-added notes from a previous structuring round.
  const existing = project.structured_knowledge as StructuredKnowledge | null;
  if (existing?.notes && existing.notes.trim().length > 0) {
    result = { ...result, notes: existing.notes };
  }

  await supabase
    .from("projects")
    .update({ structured_knowledge: result })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}/knowledge`);
}

/**
 * Chat turn for refining the structured knowledge. Persists the user message
 * AND the assistant reply, AND mutates the structured_knowledge with the
 * updated version produced by Claude.
 */
export async function sendKnowledgeChatMessage(
  projectId: string,
  formData: FormData
) {
  const { supabase, project, files } = await loadProjectAndKnowledge(projectId);

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  // Persist the user message immediately so it appears in the UI even on error.
  await supabase.from("project_knowledge_messages").insert({
    project_id: projectId,
    role: "user",
    content,
  });
  revalidatePath(`/projects/${projectId}/knowledge`);

  const current = project.structured_knowledge as StructuredKnowledge | null;
  if (!current) {
    // No structured knowledge yet — ask the user to structure first
    await supabase.from("project_knowledge_messages").insert({
      project_id: projectId,
      role: "assistant",
      content:
        "Clique d'abord sur « ✨ Structurer » pour générer le brief initial. Je pourrai ensuite intégrer tes corrections / ajouts.",
    });
    revalidatePath(`/projects/${projectId}/knowledge`);
    return;
  }

  const { data: history } = await supabase
    .from("project_knowledge_messages")
    .select("role, content")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  // Strip the just-inserted user message from history (we pass it explicitly).
  const trimmed = (history ?? []).slice(0, -1) as {
    role: "user" | "assistant";
    content: string;
  }[];

  let assistantReply: string;
  let updatedKnowledge: StructuredKnowledge = current;
  try {
    const result = await applyChatTurnToKnowledge({
      projectName: project.name,
      current,
      history: trimmed,
      userMessage: content,
      files,
    });
    assistantReply = result.assistantReply;
    updatedKnowledge = result.updatedKnowledge;
  } catch (e) {
    assistantReply = `[Erreur agent : ${(e as Error).message}]`;
  }

  await supabase
    .from("projects")
    .update({ structured_knowledge: updatedKnowledge })
    .eq("id", projectId);

  await supabase.from("project_knowledge_messages").insert({
    project_id: projectId,
    role: "assistant",
    content: assistantReply,
  });

  revalidatePath(`/projects/${projectId}/knowledge`);
}

/**
 * Reset the chat history for the knowledge structuring conversation.
 * Doesn't touch the structured_knowledge itself — just clears messages.
 */
export async function resetKnowledgeChat(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("project_knowledge_messages")
    .delete()
    .eq("project_id", projectId);

  revalidatePath(`/projects/${projectId}/knowledge`);
}

export async function updateBrandVoice(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brandVoice = String(formData.get("brand_voice") ?? "").trim();

  await supabase
    .from("projects")
    .update({ brand_voice: brandVoice || null })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}/knowledge`);
}
