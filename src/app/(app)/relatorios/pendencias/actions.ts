"use server";

import { getPerfilAtual } from "@/lib/auth";
import { avisarManutencao } from "@/lib/avisoManutencao";
import { avisoNaoConfigurado, enviarRelatorio, envioConfigurado, nomeDoCanal } from "@/lib/notificar";
import { carregarPendencias, linhasDoPdf } from "@/lib/pendencias";
import { gerarPdfPendencias } from "@/lib/pdfPendencias";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";

export type ResultadoEnvio = { erro?: string; ok?: string };

// Envia (pelo canal de NOTIFY_CHANNEL: WhatsApp ou e-mail) o PDF das compras e manutenções pendentes de cada academia
// escolhida para os usuários ativos daquela academia e para os administradores.
// Com academiaId = null (aba "Todas", só administrador) sai um envio por academia.
export async function enviarPendencias(academiaId: string | null): Promise<ResultadoEnvio> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  if (atual.perfil !== "admin" && (!academiaId || academiaId !== atual.academiaId))
    return { erro: "Você só pode enviar o relatório da sua academia." };
  if (!envioConfigurado()) return { erro: avisoNaoConfigurado() };

  const supabase = await createClient();
  let consultaAcademias = supabase.from("academias").select("id, nome").order("nome");
  if (academiaId) consultaAcademias = consultaAcademias.eq("id", academiaId);
  const { data: academias } = await consultaAcademias;
  const { data: perfis } = await supabase.from("profiles").select("email, email_relatorios, whatsapp, perfil, academia_id, academias_manutencao, ativo").eq("ativo", true);

  const dataHoje = hoje();
  const dataTexto = dataHoje.split("-").reverse().join("/");
  const enviados: string[] = [];
  const falhas: string[] = [];
  let semContato = 0;

  for (const academia of academias ?? []) {
    try {
      const para = (perfis ?? []).filter((p) => p.perfil === "admin" || (p.academia_id === academia.id && p.perfil !== "coletivas"));
      const { compras, manutencoes } = await carregarPendencias(supabase, academia.id);
      const pdf = await gerarPdfPendencias({ academia: academia.nome, dataTexto, ...linhasDoPdf(compras, manutencoes) });
      const r = await enviarRelatorio({
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
        pdf: { nome: `Pendencias ${academia.nome} ${dataHoje}.pdf`, conteudo: pdf },
      });
      falhas.push(...r.falhas.map((f) => `${academia.nome}: ${f}`));
      semContato = Math.max(semContato, r.semContato);
      // Pessoal de manutenção da unidade: só as manutenções pendentes.
      const equipe = await avisarManutencao(supabase, academia, perfis ?? []);
      falhas.push(...equipe.falhas);
      const total = r.enviados.length + equipe.enviados;
      if (total) enviados.push(`${academia.nome} (${total} ${total === 1 ? "destinatário" : "destinatários"})`);
    } catch (e) {
      falhas.push(`${academia.nome}: ${e instanceof Error ? e.message : "erro no envio"}`);
    }
  }

  const canal = nomeDoCanal();
  const pulados = semContato ? ` ${semContato} sem ${canal} no cadastro (não receberam).` : "";
  if (falhas.length)
    return { erro: `Não foi possível enviar: ${falhas.join("; ")}` + (enviados.length ? `. Enviados: ${enviados.join(", ")}.` : "") + pulados };
  if (!enviados.length) return { erro: `Ninguém com ${canal} cadastrado para receber.${pulados}` };
  return { ok: `Enviado por ${canal}: ${enviados.join(", ")}.${pulados}` };
}
