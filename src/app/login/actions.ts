"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MENSAGEM_INATIVO = "Este usuário está inativo. Fale com o administrador do sistema.";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("profiles").select("ativo").eq("id", user.id).single()
    : { data: null };
  if (perfil?.ativo === false) {
    await supabase.auth.signOut();
    redirect(`/login?erro=${encodeURIComponent(MENSAGEM_INATIVO)}`);
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
