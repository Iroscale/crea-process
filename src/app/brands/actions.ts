"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Create a new brand. Only requires `name` — all DA fields are optional and
 * filled in on the edit page.
 */
export async function createBrand(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(
      `/brands?error=${encodeURIComponent("Nom de marque obligatoire")}`
    );
  }

  const { data, error } = await supabase
    .from("brands")
    .insert({
      user_id: user.id,
      name,
      slug: slugify(name),
    })
    .select("id")
    .single();
  if (error || !data) {
    redirect(
      `/brands?error=${encodeURIComponent(error?.message ?? "Erreur création marque")}`
    );
  }

  revalidatePath("/brands");
  redirect(`/brands/${data.id}`);
}

export async function deleteBrand(brandId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("brands").delete().eq("id", brandId);

  revalidatePath("/brands");
  redirect("/brands");
}
