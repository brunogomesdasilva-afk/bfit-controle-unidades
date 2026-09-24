"use server";

import { getPerfilAtual } from "@/lib/auth";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { carregarPendencias, linhasDoPdf } from "@/lib/pendencias";
import { gerarPdfPendencias } from "@/lib/pdfPendencias";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";

export type ResultadoEnvio = { erro?: string; ok?: string };

// Envia por e-mail o PDF das compras e manutenções pendentes de cada academia escolhida para os
// usuários ativos daquela academia e para os administradores.
// Com academiaId = null (aba "Todas", só administrador) sai um e-mail por academia.
export async function enviarPendencias(academiaId: string | null): Promise<ResultadoEnvio> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  if (atual.perfil !== "admin" && (!academiaId || academiaId !== atual.academiaId))
    return { erro: "Você só pode enviar o relatório da sua academia." };
  if (!emailConfigurado())
    return { erro: "O e-mail de envio ainda não foi configurado no sistema. Fale com o administrador." };

  const supabase = await createClient();
  let consultaAcademias = supabase.from("academias").select("id, nome").order("nome");
  if (academiaId) consultaAcademias = consultaAcademias.eq("id", academiaId);
  const { data: academias } = await consultaAcademias;
  const { data: perfis } = await supabase.from("profiles").select("email, perfil, academia_id, ativo").eq("ativo", true);

  const dataHoje = hoje();
  const dataTexto = dataHoje.split("-").reverse().join("/");
  const administradores = (perfis ?? []).filter((p) => p.perfil === "admin").map((p) => p.email as string);
  const enviados: string[] = [];
  const falhas: string[] = [];

  for (const academia of academias ?? []) {
    const para = [
      ...new Set([
        ...administradores,
        ...(perfis ?? []).filter((p) => p.academia_id === academia.id).map((p) => p.email as string),
      ]),
    ];
    const { compras, manutencoes } = await carregarPendencias(supabase, academia.id);
    const pdf = await gerarPdfPendencias({ academia: academia.nome, dataTexto, ...linhasDoPdf(compras, manutencoes) });

    try {
      await enviarEmail({
        para,
        assunto: `BFIT · Compras e manutenção pendentes · ${academia.nome} · ${dataTexto}`,
        texto: [
          `Olá,`,
          ``,
          `Segue em anexo o relatório de compras e manutenções pendentes da academia ${academia.nome} em ${dataTexto}:`,
          `- ${compras.length} ${compras.length === 1 ? "compra pendente" : "compras pendentes"}`,
          `- ${manutencoes.length} ${manutencoes.length === 1 ? "manutenção pendente" : "manutenções pendentes"}`,
          ``,
          `Enviado por ${atual.nome} pelo sistema BFIT · Controle de unidades.`,
        ].join("\n"),
        anexos: [{ nome: `Pendencias ${academia.nome} ${dataHoje}.pdf`, conteudo: pdf }],
      });
      enviados.push(`${academia.nome} (${para.length} ${para.length === 1 ? "destinatário" : "destinatários"})`);
    } catch (e) {
      falhas.push(`${academia.nome}: ${e instanceof Error ? e.message : "erro no envio"}`);
    }
  }

  if (falhas.length) return { erro: `Não foi possível enviar: ${falhas.join("; ")}` + (enviados.length ? `. Enviados: ${enviados.join(", ")}.` : "") };
  return { ok: `E-mail enviado: ${enviados.join(", ")}.` };
}
