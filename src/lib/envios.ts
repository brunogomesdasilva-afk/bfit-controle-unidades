import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { acompanhamentoDiario } from "@/lib/acompanhamento";
import type { Academia } from "@/lib/database.types";
import { ehDiaUtil } from "@/lib/diasUteis";
import { enviarRelatorio, envioConfigurado, nomeDoCanal, type Canal } from "@/lib/notificar";
import { carregarPendencias, linhasDoPdf } from "@/lib/pendencias";
import { gerarPdfPendencias } from "@/lib/pdfPendencias";
import { hoje, ontem } from "@/lib/planilha";
import { htmlRelatorioSemanal, montarRelatorioSemanal, pdfRelatorioSemanal } from "@/lib/relatorioSemanal";
import type { createClient } from "@/lib/supabase/server";

// Envios automáticos (tabela regras_envio, tela Administrador > Envios automáticos). Cada regra monta UM PDF com
// todas as unidades (menos mensagens no grupo, menos risco de o WhatsApp ver como spam) e manda para o grupo e/ou as
// pessoas da regra, pelo canal dela.

export type RegraEnvio = {
  id: string;
  nome: string;
  relatorio: "manutencao" | "compras" | "acompanhamento" | "semanal";
  canal: Canal;
  grupo_id: string | null;
  grupo_nome: string | null;
  para_admins: boolean;
  usuarios: string[];
  dias: "uteis" | "semana";
  dias_semana: number[];
  hora: number;
  com_faturamento: boolean;
  ativo: boolean;
  ultimo_envio: string | null;
  ultimo_resultado: string | null;
};

export const RELATORIOS: Record<RegraEnvio["relatorio"], string> = {
  manutencao: "Manutenções pendentes (todas as unidades)",
  compras: "Compras pendentes (todas as unidades)",
  acompanhamento: "Acompanhamento diário (todas as unidades)",
  semanal: "Relatório semanal das unidades",
};

export const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function descreverQuando(r: Pick<RegraEnvio, "dias" | "dias_semana" | "hora">) {
  const dias = r.dias === "uteis" ? "Dias úteis" : [...r.dias_semana].sort().map((d) => DIAS_DA_SEMANA[d]).join(", ") || "Nenhum dia";
  return `${dias}, às ${String(r.hora).padStart(2, "0")}h`;
}

type Db = SupabaseClient | Awaited<ReturnType<typeof createClient>>;

// Um PDF só a partir de vários (um por unidade).
async function juntarPdfs(partes: Uint8Array[]) {
  const final = await PDFDocument.create();
  for (const parte of partes) {
    const doc = await PDFDocument.load(parte);
    for (const pagina of await final.copyPages(doc, doc.getPageIndices())) final.addPage(pagina);
  }
  return Buffer.from(await final.save());
}

const diaTexto = (d: string) => d.split("-").reverse().join("/");

async function montarEnvio(db: Db, regra: RegraEnvio) {
  const { data } = await db.from("academias").select("*").order("nome");
  const academias = (data ?? []) as Academia[];
  const dataHoje = hoje();

  if (regra.relatorio === "manutencao" || regra.relatorio === "compras") {
    const soManutencoes = regra.relatorio === "manutencao";
    let total = 0;
    const partes: Uint8Array[] = [];
    for (const academia of academias) {
      const { compras, manutencoes } = await carregarPendencias(db as Awaited<ReturnType<typeof createClient>>, academia.id);
      total += soManutencoes ? manutencoes.length : compras.length;
      partes.push(
        await gerarPdfPendencias({ academia: academia.nome, dataTexto: diaTexto(dataHoje), soManutencoes, soCompras: !soManutencoes, ...linhasDoPdf(compras, manutencoes) })
      );
    }
    const titulo = soManutencoes ? "Manutenções pendentes" : "Compras pendentes";
    return {
      assunto: `BFIT · ${titulo} · todas as unidades · ${diaTexto(dataHoje)} (${total})`,
      texto: `Olá,\n\nSegue em anexo o relatório de ${titulo.toLowerCase()} de todas as unidades em ${diaTexto(dataHoje)}: ${total}.\n\nEnviado automaticamente pelo sistema BFIT · Controle de unidades.`,
      pdf: { nome: `${titulo} ${dataHoje}.pdf`, conteudo: await juntarPdfs(partes) },
    };
  }

  if (regra.relatorio === "acompanhamento") {
    const referencia = ontem();
    const partes: Uint8Array[] = [];
    for (const academia of academias) partes.push((await acompanhamentoDiario(db as SupabaseClient, academia, academias, referencia, regra.com_faturamento)).pdf);
    return {
      assunto: `BFIT · Acompanhamento diário · todas as unidades · ${diaTexto(referencia)}`,
      texto: `Olá,\n\nSegue em anexo o acompanhamento diário de todas as unidades (referência ${diaTexto(referencia)}).\n\nEnviado automaticamente pelo sistema BFIT · Controle de unidades.`,
      pdf: { nome: `Acompanhamento ${referencia}.pdf`, conteudo: await juntarPdfs(partes) },
    };
  }

  const referencia = ontem();
  const relatorio = await montarRelatorioSemanal(db as SupabaseClient, referencia);
  const { pdf, arquivo } = await pdfRelatorioSemanal(relatorio);
  return {
    assunto: `BFIT · Relatório semanal das unidades · ${diaTexto(referencia)}`,
    texto: `Relatório semanal das unidades com os dados de ${diaTexto(referencia)} e a comparação com 7 dias antes (também em PDF, em anexo).`,
    html: htmlRelatorioSemanal(relatorio),
    pdf: { nome: arquivo, conteudo: pdf },
  };
}

// Monta o PDF da regra e envia. Devolve um texto curto com o resultado (fica gravado na regra e aparece na tela).
export async function executarRegra(db: Db, regra: RegraEnvio): Promise<{ ok: boolean; resultado: string }> {
  if (!envioConfigurado(regra.canal)) return { ok: false, resultado: `${nomeDoCanal(regra.canal)} de envio não configurado no servidor.` };
  const grupos = regra.canal === "whatsapp" && regra.grupo_id ? [regra.grupo_id] : [];
  const { data: perfis } = await db.from("profiles").select("id, email, email_relatorios, whatsapp, perfil").eq("ativo", true);
  const para = (perfis ?? []).filter((p) => (regra.para_admins && p.perfil === "admin") || regra.usuarios.includes(p.id));
  if (!grupos.length && !para.length) return { ok: false, resultado: "Sem destino: escolha um grupo, os administradores ou pessoas." };
  try {
    const envio = await montarEnvio(db, regra);
    const r = await enviarRelatorio({ ...envio, para, grupos, canal: regra.canal });
    const partes = [
      r.enviados.length ? `Enviado para ${r.enviados.length} destino(s)` : "Nada enviado",
      r.semContato ? `${r.semContato} pessoa(s) sem ${nomeDoCanal(regra.canal)} no cadastro` : "",
      r.falhas.length ? `Falhas: ${r.falhas.join("; ")}` : "",
    ].filter(Boolean);
    return { ok: r.enviados.length > 0 && !r.falhas.length, resultado: partes.join(". ") + "." };
  } catch (e) {
    console.error(`[envios] regra "${regra.nome}": ${e instanceof Error ? e.message : e}`);
    return { ok: false, resultado: `Erro: ${e instanceof Error ? e.message : "erro"}` };
  }
}

// Hora (0-23) e dia (aaaa-mm-dd) de agora em Brasília.
export function agoraEmBrasilia() {
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;
  return { hora, dia: hoje() };
}

// A regra vale para este dia? (dias úteis: sem sábado, domingo e feriado nacional)
export function regraValeNoDia(regra: Pick<RegraEnvio, "dias" | "dias_semana">, dia: string, feriados: Set<string>) {
  if (regra.dias === "uteis") return ehDiaUtil(dia, feriados);
  return regra.dias_semana.includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
}
