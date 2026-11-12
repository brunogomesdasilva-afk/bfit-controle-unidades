import type { SupabaseClient } from "@supabase/supabase-js";
import { feriadosDaAcademia } from "@/lib/diasUteis";
import { emailConfigurado, emailDeRelatorio, enviarEmail } from "@/lib/email";
import { baixar, idDaPasta, listarPdfs, moverRenomear, pastaFilha, type ArquivoDrive } from "@/lib/googleDrive";
import { titulosDaNota } from "@/lib/lancarNota";
import { lerNotaFiscal, type NotaLida } from "@/lib/lerNotaFiscal";

// Robô das notas do Google Drive (todo dia às 19h, e pelo botão "Rodar agora" em Administrador > Notas do Drive):
// 1. lê cada PDF da pasta de notas fiscais;
// 2. lança no contas a pagar (academia pelo CNPJ do tomador, fornecedor e categoria padrão do cadastro,
//    vencimentos da nota);
// 3. só depois de lançada, move a nota para a pasta da contabilidade, em <ano>/<mês da emissão>/<academia>, com o
//    nome "NF <número> - <fornecedor> - R$ <valor> - venc <dd-mm-aaaa>.pdf".
// Nota que não dá para lançar sozinha (fornecedor sem cadastro ou sem categoria, tomador que não é academia, sem
// vencimento) fica na pasta e entra no aviso do dia. A leitura do PDF fica guardada: a mesma nota pendente não é
// lida (nem paga) de novo enquanto o arquivo não mudar.

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const LIMITE_MS = 11 * 60 * 1000; // o resto fica para a próxima execução
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (d: string) => d.split("-").reverse().join("-");
// Caracteres que o Windows não aceita em nome de arquivo (a pasta pode ser sincronizada no computador).
const limpar = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

export type ResultadoNota = { arquivo: string; situacao: "lancada" | "ja_lancada" | "pendente" | "erro"; motivo: string | null; destino?: string };

export async function processarNotasDrive(db: SupabaseClient, opcoes: { avisar?: boolean } = {}) {
  const inicio = Date.now();
  const { data: config } = await db.from("nf_drive_config").select("*").maybeSingle();
  const pastaNotas = idDaPasta(config?.pasta_notas);
  const pastaContabil = idDaPasta(config?.pasta_contabilidade);
  if (!config?.ativo) return { resultados: [] as ResultadoNota[], aviso: "Robô desligado." };
  if (!pastaNotas || !pastaContabil) return { resultados: [] as ResultadoNota[], aviso: "As duas pastas do Drive não estão configuradas." };

  const arquivos = await listarPdfs(pastaNotas);
  const { data: academias } = await db.from("academias").select("id, nome, cnpj");
  const feriadosPorAcademia = new Map<string, Set<string>>();
  const resultados: ResultadoNota[] = [];
  let restantes = 0;

  for (const arquivo of arquivos) {
    if (Date.now() - inicio > LIMITE_MS) {
      restantes++;
      continue;
    }
    let r: ResultadoNota & { nota?: NotaLida; academiaId?: string; tituloId?: string };
    try {
      r = await processarUma(db, arquivo, {
        pastaNotas,
        pastaContabil,
        academias: (academias ?? []) as { id: string; nome: string; cnpj: string | null }[],
        feriados: async (id) => {
          if (!feriadosPorAcademia.has(id)) feriadosPorAcademia.set(id, await feriadosDaAcademia(db, id));
          return feriadosPorAcademia.get(id)!;
        },
        criadoPor: (config.atualizado_por as string | null) ?? null,
      });
    } catch (e) {
      r = { arquivo: arquivo.name, situacao: "erro", motivo: e instanceof Error ? e.message : String(e) };
    }
    resultados.push({ arquivo: r.arquivo, situacao: r.situacao, motivo: r.motivo, destino: r.destino });
    await db.from("nf_drive_log").insert({
      drive_id: arquivo.id,
      modificado: arquivo.modifiedTime,
      arquivo: arquivo.name,
      situacao: r.situacao,
      motivo: r.motivo,
      nota: r.nota ?? null,
      academia_id: r.academiaId ?? null,
      titulo_id: r.tituloId ?? null,
      destino: r.destino ?? null,
    });
  }

  if (opcoes.avisar && resultados.length) await avisar(db, resultados, restantes);
  return { resultados, restantes, aviso: null as string | null };
}

async function processarUma(
  db: SupabaseClient,
  arquivo: ArquivoDrive,
  ctx: {
    pastaNotas: string;
    pastaContabil: string;
    academias: { id: string; nome: string; cnpj: string | null }[];
    feriados: (academiaId: string) => Promise<Set<string>>;
    criadoPor: string | null;
  }
): Promise<ResultadoNota & { nota?: NotaLida; academiaId?: string; tituloId?: string }> {
  const pendente = (motivo: string, extra: { nota?: NotaLida; academiaId?: string } = {}) => ({ arquivo: arquivo.name, situacao: "pendente" as const, motivo, ...extra });

  // Leitura: a guardada, se o arquivo não mudou; senão, lê o PDF com o Claude.
  const { data: anterior } = await db
    .from("nf_drive_log")
    .select("nota, modificado")
    .eq("drive_id", arquivo.id)
    .not("nota", "is", null)
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nota = anterior?.modificado === arquivo.modifiedTime ? (anterior.nota as NotaLida) : null;
  let pdf: ArrayBuffer | null = null;
  if (!nota) {
    pdf = await baixar(arquivo.id);
    const lida = await lerNotaFiscal(pdf);
    if (!lida.nota) return { arquivo: arquivo.name, situacao: "erro", motivo: lida.erro ?? "Não foi possível ler a nota." };
    nota = lida.nota;
  }

  const academia = ctx.academias.find((a) => a.cnpj && a.cnpj === nota.tomador.documento);
  if (!academia) return pendente(`Tomador ${nota.tomador.razao_social ?? ""} (${nota.tomador.documento ?? "sem CNPJ"}) não é nenhuma academia.`, { nota });
  const { data: fornecedor } = nota.emitente.documento
    ? await db.from("fin_pessoas").select("id, razao_social, nome_fantasia, categoria_padrao_id").eq("documento", nota.emitente.documento).maybeSingle()
    : { data: null };
  if (!fornecedor) return pendente(`Fornecedor ${nota.emitente.razao_social} (${nota.emitente.documento}) não está cadastrado: lance pelo Importar NF, que cadastra pedindo só a categoria.`, { nota, academiaId: academia.id });
  if (!fornecedor.categoria_padrao_id) return pendente(`Fornecedor ${fornecedor.nome_fantasia || fornecedor.razao_social} está sem categoria padrão no cadastro.`, { nota, academiaId: academia.id });
  const nomeFornecedor = (fornecedor.nome_fantasia || fornecedor.razao_social) as string;

  // Nota já lançada (mesmo fornecedor e número): não lança de novo, só leva o PDF para a contabilidade.
  const { data: repetidas } = await db.from("fin_titulos").select("id, vencimento").eq("pessoa_id", fornecedor.id).eq("documento", nota.numero).eq("cancelado", false).order("vencimento");
  const jaLancada = (repetidas ?? []).length > 0;
  if (!jaLancada && !nota.duplicatas.length) return pendente("A nota não informa vencimento: lance pelo Importar NF informando a data.", { nota, academiaId: academia.id });

  let tituloId: string | undefined = repetidas?.[0]?.id;
  if (!jaLancada) {
    pdf ??= await baixar(arquivo.id);
    const anexo = `${academia.id}/nf/${Date.now()}-${nota.numero.replace(/\W/g, "") || "nota"}.pdf`;
    const { error: erroAnexo } = await db.storage.from("pagamentos").upload(anexo, pdf, { contentType: "application/pdf" });
    const linhas = titulosDaNota(
      {
        academiaId: academia.id,
        pessoaId: fornecedor.id,
        categoriaId: fornecedor.categoria_padrao_id,
        contaId: null,
        documento: nota.numero,
        descricao: nota.descricao,
        observacoes: [nota.forma_pagamento && `Pagamento: ${nota.forma_pagamento}`, nota.observacoes, "Lançada pelo robô das notas do Drive."].filter(Boolean).join(" · "),
        retencoes: {
          ret_iss: nota.retencoes.iss,
          ret_irrf: nota.retencoes.irrf,
          ret_inss: nota.retencoes.inss,
          ret_pis: nota.retencoes.pis,
          ret_cofins: nota.retencoes.cofins,
          ret_csll: nota.retencoes.csll,
        },
        parcelas: nota.duplicatas.map((d) => ({ vencimento: d.vencimento, valor: d.valor })),
        anexo: erroAnexo ? null : anexo,
        criadoPor: ctx.criadoPor,
      },
      await ctx.feriados(academia.id)
    );
    const { data: criados, error } = await db.from("fin_titulos").insert(linhas).select("id, vencimento").order("vencimento");
    if (error) return { arquivo: arquivo.name, situacao: "erro", motivo: `Não lançou no contas a pagar: ${error.message}`, nota, academiaId: academia.id };
    tituloId = criados?.[0]?.id;
  }

  // Só depois do lançamento: pasta da contabilidade (ano / mês da emissão / academia) e nome novo.
  const emissao = nota.data_emissao ?? new Date().toISOString().slice(0, 10);
  const ano = emissao.slice(0, 4);
  const mes = Number(emissao.slice(5, 7));
  const pastaAno = await pastaFilha(ctx.pastaContabil, ano);
  const pastaMes = await pastaFilha(pastaAno, `${String(mes).padStart(2, "0")} - ${MESES[mes - 1]}`);
  const pastaAcademia = await pastaFilha(pastaMes, limpar(academia.nome));
  const vencimentos = nota.duplicatas.map((d) => d.vencimento).sort();
  const venc = vencimentos[0] ?? repetidas?.[0]?.vencimento ?? emissao;
  const nome = limpar(
    `NF ${nota.numero} - ${nomeFornecedor} - R$ ${brl(nota.valor_total)} - venc ${dataBr(venc)}${vencimentos.length > 1 ? ` (${vencimentos.length} parcelas)` : ""}`
  ) + ".pdf";
  await moverRenomear(arquivo.id, ctx.pastaNotas, pastaAcademia, nome);
  const destino = `${ano}/${String(mes).padStart(2, "0")} - ${MESES[mes - 1]}/${academia.nome}/${nome}`;
  return jaLancada
    ? { arquivo: arquivo.name, situacao: "ja_lancada", motivo: "Já estava no contas a pagar: só foi levada para a contabilidade.", destino, nota, academiaId: academia.id, tituloId }
    : { arquivo: arquivo.name, situacao: "lancada", motivo: null, destino, nota, academiaId: academia.id, tituloId };
}

// Resumo do dia por e-mail para os administradores (no "E-mail para relatórios" de cada um).
async function avisar(db: SupabaseClient, resultados: ResultadoNota[], restantes: number) {
  if (!emailConfigurado()) return;
  const { data: perfis } = await db.from("profiles").select("email, email_relatorios").eq("perfil", "admin").eq("ativo", true);
  const para = [...new Set((perfis ?? []).map((p) => emailDeRelatorio(p)).filter(Boolean))];
  if (!para.length) return;
  const grupo = (s: ResultadoNota["situacao"]) => resultados.filter((r) => r.situacao === s);
  const linhas = (titulo: string, lista: ResultadoNota[], detalhe: (r: ResultadoNota) => string) =>
    lista.length ? [`${titulo} (${lista.length}):`, ...lista.map((r) => `- ${r.arquivo}: ${detalhe(r)}`), ""] : [];
  await enviarEmail({
    para,
    assunto: `BFIT · Notas do Drive · ${grupo("lancada").length} lançadas${grupo("pendente").length + grupo("erro").length ? ` · ${grupo("pendente").length + grupo("erro").length} pendentes` : ""}`,
    texto: [
      "Resumo do robô das notas fiscais do Google Drive:",
      "",
      ...linhas("Lançadas no contas a pagar e levadas para a contabilidade", grupo("lancada"), (r) => r.destino ?? ""),
      ...linhas("Já estavam lançadas (só levadas para a contabilidade)", grupo("ja_lancada"), (r) => r.destino ?? ""),
      ...linhas("Pendentes (ficaram na pasta de notas)", grupo("pendente"), (r) => r.motivo ?? ""),
      ...linhas("Com erro (ficaram na pasta de notas)", grupo("erro"), (r) => r.motivo ?? ""),
      restantes ? `${restantes} notas ficaram para a próxima execução (tempo esgotado).` : "",
    ].join("\n"),
  });
}
