"use server";

import { getPerfilAtual } from "@/lib/auth";
import { mesDeFechamento, montarFechamento, nomeDoMes } from "@/lib/fechamento";
import { avisoNaoConfigurado, contatos, enviarRelatorio, envioConfigurado, nomeDoCanal } from "@/lib/notificar";
import { createClient } from "@/lib/supabase/server";
import type { ResultadoEnvio } from "../pendencias/actions";

// Envia (pelo canal de NOTIFY_CHANNEL: WhatsApp ou e-mail) o PDF do fechamento do mês de uma academia para os usuários
// ativos dela e os administradores.
export async function enviarFechamento(academiaId: string, mesPedido: string): Promise<ResultadoEnvio> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  if (atual.perfil !== "admin" && academiaId !== atual.academiaId) return { erro: "Você só pode enviar o fechamento da sua academia." };
  if (mesDeFechamento(mesPedido) !== mesPedido) return { erro: "O fechamento só pode ser feito do mês atual para trás." };
  if (!envioConfigurado()) return { erro: avisoNaoConfigurado() };

  const supabase = await createClient();
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", academiaId).maybeSingle();
  if (!academia) return { erro: "Academia não encontrada." };
  const { data: perfis } = await supabase.from("profiles").select("email, email_relatorios, whatsapp, perfil, academia_id").eq("ativo", true);
  const para = (perfis ?? []).filter((p) => p.perfil === "admin" || (p.academia_id === academia.id && p.perfil !== "coletivas"));
  const canal = nomeDoCanal();
  if (!contatos(para).length) return { erro: `Ninguém com ${canal} cadastrado para receber o fechamento.` };

  const { proximoMes, aniversariantes, semDiario, contagens, datas, crefs, ferias, pdf, arquivo } = await montarFechamento(supabase, academia, mesPedido);
  const r = await enviarRelatorio({
    para,
    assunto: `BFIT · Fechamento do mês · ${academia.nome} · ${nomeDoMes(mesPedido)}`,
    texto: [
      `Olá,`,
      ``,
      `Segue em anexo o fechamento de ${nomeDoMes(mesPedido)} da academia ${academia.nome}.`,
      `- Aniversariantes de ${nomeDoMes(proximoMes)}: ${aniversariantes.length}`,
      `- Dias sem lançamento no diário: ${semDiario.length}`,
      ...crefs
        .filter((d) => d.situacao === "Vencido" || d.situacao === "Vence em breve")
        .map((d) => `- ATENÇÃO: CREF de ${d.item} ${d.situacao === "Vencido" ? "vencido" : "vence"} em ${d.vencimento!.split("-").reverse().join("/")}`),
      ...ferias
        .filter((d) => d.situacao === "Vencido" || d.situacao === "Vence em breve")
        .map((d) => `- ATENÇÃO: férias de ${d.item} com limite em ${d.vencimento!.split("-").reverse().join("/")}`),
      ...datas
        .filter((d) => d.situacao === "Vencido" || d.situacao === "Vence em breve")
        .map((d) => `- ATENÇÃO: ${d.item} ${d.situacao === "Vencido" ? "vencido" : "vence"} em ${d.vencimento!.split("-").reverse().join("/")}`),
      `- Contagens não feitas: ${contagens.reduce((n, c) => n + c.horarios.length, 0)} horários em ${new Set(contagens.map((c) => c.data)).size} dias`,
      ``,
      `Enviado por ${atual.nome} pelo sistema BFIT · Controle de unidades.`,
    ].join("\n"),
    pdf: { nome: arquivo, conteudo: pdf },
  });
  const n = r.enviados.length;
  const enviadosTexto = n ? `Enviado por ${canal} para ${n} ${n === 1 ? "destinatário" : "destinatários"}.` : "";
  const pulados = r.semContato ? ` ${r.semContato} sem ${canal} no cadastro (não receberam).` : "";
  if (r.falhas.length) return { erro: `${enviadosTexto} Não foi possível enviar: ${r.falhas.join("; ")}.${pulados}`.trim() };
  return { ok: `${enviadosTexto}${pulados}` };
}
