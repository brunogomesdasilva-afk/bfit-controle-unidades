"use server";

import { getPerfilAtual, temModulo } from "@/lib/auth";
import { avisoNaoConfigurado, contatos, enviarRelatorio, envioConfigurado, nomeDoCanal } from "@/lib/notificar";
import { htmlRelatorioSemanal, montarRelatorioSemanal, pdfRelatorioSemanal } from "@/lib/relatorioSemanal";
import { createClient } from "@/lib/supabase/server";

// Botão "Enviar" do Fechamento semanal: manda o relatório do dia escolhido para quem clicou, pelo canal de
// NOTIFY_CHANNEL (PDF no WhatsApp do cadastro, ou e-mail no "E-mail para relatórios"), sem esperar a quinta-feira.
export async function enviarFechamentoSemanal(referencia: string): Promise<{ erro?: string; ok?: string }> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Só quem tem o módulo Financeiro envia este relatório." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referencia)) return { erro: "Data inválida." };
  if (!envioConfigurado()) return { erro: avisoNaoConfigurado() };
  const supabase = await createClient();
  const { data: perfil } = await supabase.from("profiles").select("email, email_relatorios, whatsapp").eq("id", atual.id).maybeSingle();
  const canal = nomeDoCanal();
  if (!perfil || !contatos([perfil]).length) return { erro: `Seu cadastro não tem ${canal}. Peça ao administrador para preencher em Usuários.` };
  const relatorio = await montarRelatorioSemanal(supabase, referencia);
  const { pdf, arquivo } = await pdfRelatorioSemanal(relatorio);
  const dia = referencia.split("-").reverse().join("/");
  const r = await enviarRelatorio({
    para: [perfil],
    assunto: `BFIT · Relatório semanal das unidades · ${dia}`,
    texto: `Relatório semanal das unidades com os dados de ${dia} e a comparação com 7 dias antes (também em PDF, em anexo). Abra o e-mail em formato HTML para ver as tabelas.`,
    html: htmlRelatorioSemanal(relatorio),
    pdf: { nome: arquivo, conteudo: pdf },
  });
  if (r.falhas.length) return { erro: `Não foi possível enviar: ${r.falhas.join("; ")}` };
  return { ok: `Relatório enviado por ${canal} para ${r.enviados.join(", ")}.` };
}
