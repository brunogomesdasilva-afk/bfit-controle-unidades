import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { faltasNosParametros } from "@/lib/cnab";
import { parametrosDe, titulosParaLote } from "@/lib/loteBanco";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { LoteBanco } from "./LoteBanco";

// Financeiro > Relatórios > Gerar lote para o banco: escolhe pagar (CNAB 240) ou receber (CNAB 400), a conta e o
// período da previsão; lista os títulos em aberto dessa conta com a forma de pagamento e o que falta; gera o
// arquivo de remessa para enviar ao banco. Os arquivos gerados ficam no histórico.

const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default async function LoteBancoPage({ searchParams }: PageProps<"/financeiro/lote-banco">) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const p = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const tipo = p("tipo") === "receber" ? "receber" : "pagar";
  const de = p("de") ?? hoje();
  const ate = p("ate") ?? somarDias(hoje(), 7);
  const supabase = await createClient();

  const [{ data: parametros }, { data: lotes }] = await Promise.all([
    supabase.from("fin_cnab_parametros").select("*, fin_contas(nome)").eq("tipo", tipo).eq("ativo", true),
    supabase.from("fin_cnab_lotes").select("id, tipo, nsa, arquivo_nome, quantidade, total, criado_em, fin_contas(nome), autor:profiles(nome)").order("criado_em", { ascending: false }).limit(30),
  ]);
  const contas = (parametros ?? []).map((x) => ({ id: x.conta_id as string, nome: (x.fin_contas as unknown as { nome: string } | null)?.nome ?? "", bruto: x }));
  const conta = contas.find((c) => c.id === p("conta")) ?? contas.find((c) => /bradesco/i.test(c.nome)) ?? contas[0];
  const parametrosConta = conta ? parametrosDe(conta.bruto) : null;
  const faltas = parametrosConta ? faltasNosParametros(parametrosConta, tipo) : [];
  const itens = conta && parametrosConta ? await titulosParaLote(supabase, tipo, conta.id, parametrosConta.banco, { de, ate }) : [];
  const q = (mudar: Record<string, string>) => new URLSearchParams({ tipo, ...(conta ? { conta: conta.id } : {}), de, ate, ...mudar }).toString();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Gerar lote para o banco</h1>
        <p className="text-sm text-slate-500">
          Arquivo de remessa (CNAB) com os títulos em aberto da conta, pela data de previsão. Envie o arquivo pelo internet banking (Bradesco: Net Empresa →
          Multipag / Cobrança → Transmissão de arquivos). Depois que o banco pagar, registre a baixa no contas a pagar.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["pagar", "receber"] as const).map((t) => (
          <Link key={t} href={`/financeiro/lote-banco?${new URLSearchParams({ tipo: t, de, ate })}`} className={`rounded-full px-3 py-1 text-sm ${t === tipo ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {t === "pagar" ? "Pagamentos (contas a pagar)" : "Cobrança (contas a receber)"}
          </Link>
        ))}
      </div>

      {!contas.length ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nenhuma conta com parâmetros de {tipo === "pagar" ? "pagamentos" : "cobrança"}. Configure em{" "}
          <Link href="/financeiro/cadastros/cnab" className="underline">
            Cadastros → Parâmetros CNAB
          </Link>
          .
        </p>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3" action="/financeiro/lote-banco">
            <input type="hidden" name="tipo" value={tipo} />
            <label className="text-xs text-slate-600">
              Conta
              <select name="conta" defaultValue={conta?.id} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Previsão de
              <input type="date" name="de" defaultValue={de} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">
              Até
              <input type="date" name="ate" defaultValue={ate} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Buscar
            </button>
          </form>
          {faltas.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Os parâmetros desta conta estão incompletos ({faltas.join(", ")}): complete em{" "}
              <Link href="/financeiro/cadastros/cnab" className="underline">
                Parâmetros CNAB
              </Link>{" "}
              para gerar o arquivo.
            </p>
          )}
          <LoteBanco key={q({})} tipo={tipo} contaId={conta!.id} itens={itens} podeGerar={faltas.length === 0} />
        </>
      )}

      <LoteBanco.Historico
        lotes={(lotes ?? []).map((l) => ({
          id: l.id as string,
          tipo: l.tipo as string,
          nsa: l.nsa as number,
          nome: l.arquivo_nome as string,
          quantidade: l.quantidade as number,
          total: Number(l.total),
          criadoEm: l.criado_em as string,
          conta: (l.fin_contas as unknown as { nome: string } | null)?.nome ?? "",
          autor: (l.autor as unknown as { nome: string } | null)?.nome ?? "",
        }))}
      />
    </div>
  );
}
