"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Mensagem sempre igual, exista ou não o e-mail: não dá pista de quais e-mails têm conta no sistema.
const MENSAGEM = "Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha em instantes.";

export async function solicitarRedefinicaoSenha(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    redirect(`/login/esqueci-senha?erro=${encodeURIComponent("Informe o e-mail.")}`);
  }

  const cabecalhos = await headers();
  const host = cabecalhos.get("host") ?? "";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? `${protocolo}://${host}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origem}/auth/confirm?next=/login/redefinir-senha`,
  });

  redirect(`/login/esqueci-senha?ok=${encodeURIComponent(MENSAGEM)}`);
}
