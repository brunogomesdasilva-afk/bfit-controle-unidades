"use server";

import { getPerfilAtual } from "@/lib/auth";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { mesDeFechamento, montarFechamento, nomeDoMes } from "@/lib/fechamento";
import { createClient } from "@/lib/supabase/server";
import type { ResultadoEnvio } from "../pendencias/actions";

// Envia o PDF do fechamento do mês de uma academia para os usuários ativos dela e os administradores.
export async function enviarFechamento(academiaId: string, mesPedido: string): Promise<ResultadoEnvio> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  if (atual.perfil !== "admin" && academiaId !== atual.academiaId) return { erro: "Você só pode enviar o fechamento da sua academia." };
  if (mesDeFechamento(mesPedido) !== mesPedido) return { erro: "O fechamento só pode ser feito do mês atual para trás." };
  if (!emailConfigurado()) return { erro: "O e-mail de envio ainda não foi configurado no sistema. Fale com o administrador." };

  const supabase = await createClient();
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", academiaId).maybeSingle();
  if (!academia) return { erro: "Academia não encontrada." };
  const { data: perfis } = await supabase.from("profiles").select("email, perfil, academia_id").eq("ativo", true);
  const para = [
    ...new Set(
      (perfis ?? []).filter((p) => p.perfil === "admin" || p.academia_id === academia.id).map((p) => p.email as string)
    ),
  ];

  const { proximoMes, aniversariantes, semDiario, contagens, datas, crefs, ferias, pdf, arquivo } = await montarFechamento(supabase, academia, mesPedido);
  try {
    await enviarEmail({
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
      anexos: [{ nome: arquivo, conteudo: pdf }],
    });
  } catch (e) {
    return { erro: `Não foi possível enviar: ${e instanceof Error ? e.message : "erro no envio"}` };
  }
  return { ok: `E-mail enviado para ${para.length} ${para.length === 1 ? "destinatário" : "destinatários"}.` };
}
