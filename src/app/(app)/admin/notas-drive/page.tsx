import { exigirAdmin } from "@/lib/auth";
import { driveConfigurado, emailDaContaDeServico } from "@/lib/googleDrive";
import type { ResultadoNota } from "@/lib/nfDrive";
import { createClient } from "@/lib/supabase/server";
import { FormNotasDrive, Situacao } from "./FormNotasDrive";

// "Rodar agora" lê as notas com o Claude, uma a uma.
export const maxDuration = 800;

// Administrador > Notas do Drive: as duas pastas do Google Drive do robô das notas fiscais (todo dia às 19h) e o
// histórico do que ele fez com cada arquivo.
export default async function NotasDrivePage() {
  await exigirAdmin();
  const supabase = await createClient();
  const [{ data: config }, { data: log }] = await Promise.all([
    supabase.from("nf_drive_config").select("*").maybeSingle(),
    supabase.from("nf_drive_log").select("executado_em, arquivo, situacao, motivo, destino").order("executado_em", { ascending: false }).limit(100),
  ]);
  const conta = emailDaContaDeServico();
  const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notas do Drive</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo dia às 19h o sistema lê os PDFs da pasta de notas fiscais, lança cada nota no contas a pagar e, depois de lançada, move a nota para a
          pasta da contabilidade, em <strong>ano / mês da emissão / academia</strong>, com o nome &quot;NF número - fornecedor - R$ valor - venc
          data&quot;. Nota que não dá para lançar sozinha (fornecedor sem cadastro ou sem categoria, tomador que não é academia, sem vencimento) fica
          na pasta e vai no e-mail de resumo do dia.
        </p>
      </div>

      {!driveConfigurado() ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O acesso ao Google Drive ainda não foi configurado no servidor (variável GOOGLE_SERVICE_ACCOUNT_JSON na Vercel).
        </p>
      ) : (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Compartilhe as duas pastas no Google Drive, como <strong>Editor</strong>, com a conta do sistema:{" "}
          <code className="select-all font-medium">{conta}</code>
        </p>
      )}

      <FormNotasDrive
        inicial={{ notas: config?.pasta_notas ?? "", contabilidade: config?.pasta_contabilidade ?? "", ativo: config?.ativo ?? true }}
        podeRodar={driveConfigurado() && Boolean(config?.pasta_notas && config?.pasta_contabilidade)}
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
