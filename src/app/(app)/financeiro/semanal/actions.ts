"use server";

import { getPerfilAtual, temModulo } from "@/lib/auth";
import { emailConfigurado, emailDeRelatorio, enviarEmail } from "@/lib/email";
import { htmlRelatorioSemanal, montarRelatorioSemanal } from "@/lib/relatorioSemanal";
import { createClient } from "@/lib/supabase/server";

// Botão "Enviar por e-mail" do Fechamento semanal: manda o relatório do dia escolhido para quem clicou (no
// "E-mail para relatórios" do cadastro, se preenchido), sem esperar a quinta-feira.
export async function enviarFechamentoSemanal(referencia: string): Promise<{ erro?: string; ok?: string }> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Só quem tem o módulo Financeiro envia este relatório." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referencia)) return { erro: "Data inválida." };
  if (!emailConfigurado()) return { erro: "O e-mail de envio não está configurado no servidor." };
  const supabase = await createClient();
  const { data: perfil } = await supabase.from("profiles").select("email, email_relatorios").eq("id", atual.id).maybeSingle();
  const para = perfil ? emailDeRelatorio(perfil) : "";
  if (!para) return { erro: "Seu cadastro não tem e-mail." };
  const relatorio = await montarRelatorioSemanal(supabase, referencia);
  const dia = referencia.split("-").reverse().join("/");
  try {
    await enviarEmail({
      para: [para],
      assunto: `BFIT · Relatório semanal das unidades · ${dia}`,
      texto: `Relatório semanal das unidades com os dados de ${dia} e a comparação com 7 dias antes. Abra o e-mail em formato HTML para ver as tabelas.`,
      html: htmlRelatorioSemanal(relatorio),
    });
  } catch (e) {
    return { erro: `Não foi possível enviar: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: `Relatório enviado para ${para}.` };
}
