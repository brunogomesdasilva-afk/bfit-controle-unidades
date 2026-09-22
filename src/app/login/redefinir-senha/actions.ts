"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function redefinirSenha(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < 6) {
    redirect(`/login/redefinir-senha?erro=${encodeURIComponent("A senha precisa ter pelo menos 6 caracteres.")}`);
  }
  if (senha !== confirmacao) {
    redirect(`/login/redefinir-senha?erro=${encodeURIComponent("As senhas não coincidem.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?erro=${encodeURIComponent("O link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.")}`
    );
  }

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    redirect(`/login/redefinir-senha?erro=${encodeURIComponent(error.message)}`);
  }

  // Encerra a sessão de recuperação e pede para entrar de novo, já com a senha nova.
  await supabase.auth.signOut();
  redirect(`/login?ok=${encodeURIComponent("Senha alterada. Entre com a sua nova senha.")}`);
}
