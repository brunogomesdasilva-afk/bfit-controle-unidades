"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function voltar(params: Record<string, string>): never {
  redirect(`/usuarios?${new URLSearchParams(params).toString()}`);
}

// O campo "acesso" da tela vale "admin" (todas as academias) ou o id de uma academia.
async function lerAcesso(formData: FormData) {
  const acesso = String(formData.get("acesso") ?? "");
  if (acesso === "admin") return { perfil: "admin", academia_id: null };

  const supabase = await createClient();
  const { data: academia } = acesso
    ? await supabase.from("academias").select("id").eq("id", acesso).maybeSingle()
    : { data: null };
  if (!academia) voltar({ erro: "Escolha o acesso do usuário: administrador ou uma academia." });
  return { perfil: "usuario", academia_id: academia.id as string };
}

export async function criarUsuario(formData: FormData) {
  await exigirAdmin();

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  if (!nome || !email) voltar({ erro: "Informe o nome e o e-mail." });
  if (senha.length < 6) voltar({ erro: "A senha precisa ter pelo menos 6 caracteres." });
  const acesso = await lerAcesso(formData);

  const admin = createAdminClient();
  if (!admin) {
    voltar({ erro: "Chave de serviço do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY)." });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user) {
    const jaExiste = error?.message.toLowerCase().includes("already");
    voltar({ erro: jaExiste ? "Já existe um usuário com esse e-mail." : (error?.message ?? "Erro ao criar o usuário.") });
  }

  // O perfil (linha em profiles) é criado por um gatilho do banco, ainda sem acesso; aqui ele recebe o acesso.
  const { error: erroPerfil } = await admin.from("profiles").update(acesso).eq("id", data.user.id);
  if (erroPerfil) voltar({ erro: erroPerfil.message });

  revalidatePath("/usuarios");
  voltar({ ok: `Usuário ${nome} criado.` });
}

// O nome é o que aparece no sistema no lugar do e-mail.
export async function alterarNomeUsuario(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  if (!nome) voltar({ erro: "Informe o nome." });

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ nome }).eq("id", usuarioId);
  if (error) voltar({ erro: error.message });

  revalidatePath("/", "layout");
  voltar({ ok: "Nome atualizado." });
}

export async function alterarAcessoUsuario(usuarioId: string, formData: FormData) {
  const atual = await exigirAdmin();
  if (usuarioId === atual.id) voltar({ erro: "Você não pode alterar o seu próprio acesso." });
  const acesso = await lerAcesso(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(acesso).eq("id", usuarioId);
  if (error) voltar({ erro: error.message });

  revalidatePath("/usuarios");
  voltar({ ok: "Acesso atualizado." });
}

// O e-mail é o login do usuário: troca no Supabase Auth (precisa da chave de serviço) e no perfil.
export async function alterarEmailUsuario(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) voltar({ erro: "Informe um e-mail válido.", editarEmail: usuarioId });

  const admin = createAdminClient();
  if (!admin) {
    voltar({
      erro: "Chave de serviço do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY).",
      editarEmail: usuarioId,
    });
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { email, email_confirm: true });
  if (error) {
    const jaExiste = /already|registered|exists/i.test(error.message);
    voltar({
      erro: jaExiste ? "Já existe um usuário com esse e-mail." : error.message,
      editarEmail: usuarioId,
    });
  }

  const { error: erroPerfil } = await admin.from("profiles").update({ email }).eq("id", usuarioId);
  if (erroPerfil) voltar({ erro: erroPerfil.message });

  revalidatePath("/usuarios");
  voltar({ ok: "E-mail atualizado. O usuário passa a entrar com o novo e-mail." });
}

// O administrador define uma senha nova para outro usuário (por exemplo, para destravar alguém que
// esqueceu a senha inicial e não tem acesso ao e-mail no momento). O usuário passa a entrar com essa
// senha; vale a pena avisá-lo por fora do sistema (telefone, presencialmente etc.), nunca por aqui.
export async function redefinirSenhaUsuario(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < 6) {
    voltar({ erro: "A senha precisa ter pelo menos 6 caracteres.", redefinirSenha: usuarioId });
  }
  if (senha !== confirmacao) {
    voltar({ erro: "As senhas não coincidem.", redefinirSenha: usuarioId });
  }

  const admin = createAdminClient();
  if (!admin) {
    voltar({
      erro: "Chave de serviço do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY).",
      redefinirSenha: usuarioId,
    });
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: senha });
  if (error) voltar({ erro: error.message, redefinirSenha: usuarioId });

  voltar({ ok: "Senha redefinida. Avise o usuário pessoalmente — não fica registrado em nenhum lugar." });
}

// Ativa ou inativa um usuário (nunca exclui, para preservar o histórico).
export async function alterarStatusUsuario(usuarioId: string, formData: FormData) {
  const atual = await exigirAdmin();
  const ativar = String(formData.get("ativo") ?? "") === "true";

  if (usuarioId === atual.id) voltar({ erro: "Você não pode inativar o seu próprio usuário." });

  const supabase = await createClient();
  const { data: alvo } = await supabase.from("profiles").select("id, nome").eq("id", usuarioId).single();
  if (!alvo) voltar({ erro: "Usuário não encontrado." });

  const { error } = await supabase
    .from("profiles")
    .update({ ativo: ativar, ativo_alterado_em: new Date().toISOString(), ativo_alterado_por: atual.id })
    .eq("id", usuarioId);
  if (error) voltar({ erro: error.message });

  // Bloqueia também no Supabase Auth (encerra sessões e impede novo login), se a chave estiver configurada.
  const admin = createAdminClient();
  if (admin) {
    await admin.auth.admin.updateUserById(usuarioId, { ban_duration: ativar ? "none" : "876000h" });
  }

  revalidatePath("/", "layout");
  voltar({ ok: ativar ? `${alvo.nome} foi reativado.` : `${alvo.nome} foi inativado.` });
}
