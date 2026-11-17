import { exigirAdmin } from "@/lib/auth";
import { driveConfigurado, emailDaContaDeServico } from "@/lib/googleDrive";
import type { NotaLida } from "@/lib/lerNotaFiscal";
import { caminhoLocal, rodaComPastasLocais, SEM_DISCO_LOCAL, type ResultadoNota } from "@/lib/nfDrive";
import { createClient } from "@/lib/supabase/server";
import { FormNotasDrive, Situacao } from "./FormNotasDrive";
import { Pendentes, type NotaPendente } from "./Pendentes";

// "Rodar agora" lê as notas com o Claude, uma a uma.
export const maxDuration = 800;

// Administrador > Notas do Drive: as duas pastas do robô das notas fiscais (Google Drive ou computador), o botão
// "Rodar agora" (não há execução automática) e o histórico do que ele fez com cada arquivo.
export default async function NotasDrivePage() {
  await exigirAdmin();
  const supabase = await createClient();
  const [{ data: config }, { data: log }, { data: recentes }, { data: categorias }, { data: academias }] = await Promise.all([
    supabase.from("nf_drive_config").select("*").maybeSingle(),
    supabase.from("nf_drive_log").select("executado_em, arquivo, situacao, motivo, destino").order("executado_em", { ascending: false }).limit(100),
    // Para as pendentes: a última passagem de cada arquivo.
    supabase.from("nf_drive_log").select("drive_id, arquivo, situacao, motivo, nota, academia_id").order("executado_em", { ascending: false }).limit(1000),
    supabase.from("fin_categorias").select("id, nome, fin_grupos(nome)").eq("tipo", "despesa").eq("ativo", true).order("nome"),
    supabase.from("academias").select("id, nome"),
  ]);
  // Notas pendentes que dá para resolver na tela (falta categoria e/ou vencimento; tomador já identificado).
  const ultimos = new Map<string, NonNullable<typeof recentes>[number]>();
  for (const l of recentes ?? []) if (!ultimos.has(l.drive_id as string)) ultimos.set(l.drive_id as string, l);
  const abertas = [...ultimos.values()].filter((l) => l.situacao === "pendente" && l.nota && l.academia_id);
  const documentos = abertas.map((l) => (l.nota as NotaLida).emitente.documento).filter(Boolean);
  const { data: fornecedores } = documentos.length
    ? await supabase.from("fin_pessoas").select("documento, razao_social, nome_fantasia, categoria_padrao_id").in("documento", documentos)
    : { data: [] };
  const pendentes: NotaPendente[] = abertas.map((l) => {
    const n = l.nota as NotaLida;
    const f = (fornecedores ?? []).find((x) => x.documento === n.emitente.documento);
    return {
      arquivoId: l.drive_id as string,
      arquivo: l.arquivo as string,
      fornecedor: (f?.nome_fantasia || f?.razao_social || n.emitente.razao_social) as string,
      academia: (academias ?? []).find((a) => a.id === l.academia_id)?.nome ?? "",
      numero: n.numero,
      emissao: n.data_emissao,
      valor: n.valor_liquido || n.valor_total,
      categoriaId: (f?.categoria_padrao_id as string | null) ?? null,
      semVencimento: !n.duplicatas.length,
      motivo: (l.motivo as string | null) ?? "",
    };
  });
  const opcoesCategoria = (categorias ?? []).map((c) => ({ valor: c.id as string, rotulo: c.nome as string, grupo: (c.fin_grupos as unknown as { nome: string } | null)?.nome }));
  const conta = emailDaContaDeServico();
  const local = caminhoLocal(config?.pasta_notas) && caminhoLocal(config?.pasta_contabilidade);
  const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notas do Drive</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ao clicar em <strong>Rodar agora</strong>, o sistema lê os PDFs da pasta de notas fiscais, lança cada nota no contas a pagar e, depois de lançada, move a nota para a
          pasta da contabilidade, em <strong>ano / mês da emissão / academia</strong>, com o nome &quot;NF número - fornecedor - R$ valor - venc
          data&quot;. Fornecedor novo é cadastrado com os dados da nota e da Receita. Se faltar a categoria do fornecedor ou o vencimento, a nota fica em Notas pendentes para você informar e lançar. A que não é de nenhuma academia (tomador) fica
          na pasta e aparece no resultado e no e-mail de resumo.
        </p>
      </div>

      {local ? (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <p>
            <strong>Pastas do computador.</strong> O site na internet não enxerga o seu disco: o botão Rodar agora funciona com o sistema aberto no próprio
            computador (pelo <code className="font-medium">iniciar-sistema.bat</code>, em localhost:3001). Outra forma: dois cliques em{" "}
            <code className="font-medium">rodar-notas-do-computador.bat</code>, na pasta do projeto. O resultado aparece no histórico abaixo. Para usar o
            Google Drive depois, troque os caminhos pelos links das pastas.
          </p>
        </div>
      ) : !driveConfigurado() ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O acesso ao Google Drive ainda não foi configurado no servidor (variável GOOGLE_SERVICE_ACCOUNT_JSON na Vercel). Enquanto isso, dá para usar pastas do computador: cole nos campos o caminho delas (ex.: C:\Users\bruno\Notas).
        </p>
      ) : (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Compartilhe as duas pastas no Google Drive, como <strong>Editor</strong>, com a conta do sistema:{" "}
          <code className="select-all font-medium">{conta}</code>
        </p>
      )}

      <FormNotasDrive
        inicial={{ notas: config?.pasta_notas ?? "", contabilidade: config?.pasta_contabilidade ?? "", ativo: config?.ativo ?? true }}
        podeRodar={Boolean(config?.pasta_notas && config?.pasta_contabilidade) && (local ? rodaComPastasLocais() : driveConfigurado())}
        motivoSemRodar={!config?.pasta_notas || !config?.pasta_contabilidade ? "Salve as duas pastas primeiro." : local ? SEM_DISCO_LOCAL : "O acesso ao Google Drive ainda não foi configurado."}
      />

      <Pendentes
        pendentes={pendentes}
        categorias={opcoesCategoria}
        podeLancar={local ? rodaComPastasLocais() : driveConfigurado()}
        motivoSemLancar={local ? SEM_DISCO_LOCAL : "O acesso ao Google Drive ainda não foi configurado."}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Histórico</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {(log ?? []).map((l, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{quando(l.executado_em as string)}</td>
                  <td className="px-3 py-2">{l.arquivo as string}</td>
                  <td className="px-3 py-2">
                    <Situacao s={l.situacao as ResultadoNota["situacao"]} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{(l.destino as string | null) ?? (l.motivo as string | null) ?? ""}</td>
                </tr>
              ))}
              {!log?.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    O robô ainda não rodou.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
