"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    redirect(`/projects?error=${encodeURIComponent("Le nom est requis")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      description: description || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/projects?error=${encodeURIComponent(
        error?.message ?? "Erreur lors de la création du projet"
      )}`
    );
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}
