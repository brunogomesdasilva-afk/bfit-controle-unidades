"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function alterarMinhaSenha(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < 6) {
    redirect(`/minha-conta?erro=${encodeURIComponent("A senha precisa ter pelo menos 6 caracteres.")}`);
  }
  if (senha !== confirmacao) {
    redirect(`/minha-conta?erro=${encodeURIComponent("As senhas não coincidem.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    redirect(`/minha-conta?erro=${encodeURIComponent(error.message)}`);
  }

  redirect(`/minha-conta?ok=${encodeURIComponent("Senha alterada.")}`);
}
