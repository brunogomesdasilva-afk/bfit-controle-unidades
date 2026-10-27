import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { nomePessoa, type Movimento } from "@/lib/financeiro";
import { hoje } from "@/lib/planilha";
import { listasFinanceiro } from "../listas";
import { Extrato, type LinhaExtrato, type TituloAberto } from "./Extrato";

// Financeiro > Conciliação: o extrato de uma conta no período (como o do banco), com o saldo e a conciliação.
export default async function ConciliacaoPage({ searchParams }: PageProps<"/financeiro/conciliacao">) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const p = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const { supabase, academias } = await contextoAcademias(undefined);
  const listas = await listasFinanceiro(supabase);
  const contas = listas.contas.filter((c) => c.ativa);
  const conta = contas.find((c) => c.id === p("conta")) ?? contas[0] ?? null;
  const mes = hoje().slice(0, 7);
  const de = p("de") ?? `${mes}-01`;
  const ate = p("ate") ?? hoje();
  const nomeAcademia = (id: string) => academias.find((a) => a.id === id)?.nome ?? "";

  if (!conta)
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-slate-900">Conciliação</h1>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nenhuma conta bancária cadastrada. Cadastre em{" "}
          <Link href="/financeiro/cadastros/contas" className="font-medium underline">
            Cadastros → Contas bancárias
          </Link>
          .
        </p>
      </div>
    );

  // O banco devolve no máximo 1000 linhas por consulta: busca em páginas.
  const tudo = async <T,>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>) => {
    const lista: T[] = [];
    for (let i = 0; ; i += 1000) {
      const { data } = await consulta(i, i + 999);
      lista.push(...(data ?? []));
      if (!data || data.length < 1000) return lista;
    }
  };
  // Saldo antes do período: saldo inicial da conta + lançamentos desde a data dele até o dia anterior ao período.
  const [antes, movs, { data: abertosData }] = await Promise.all([
    tudo((i, f) => supabase.from("fin_movimentos").select("valor").eq("conta_id", conta.id).gte("data", conta.data_saldo_inicial).lt("data", de).order("id").range(i, f)),
    tudo((i, f) => supabase.from("fin_movimentos").select("*").eq("conta_id", conta.id).gte("data", de).lte("data", ate).order("data").order("criado_em").order("id").range(i, f)),
    supabase
      .from("fin_titulos_situacao")
      .select("id, tipo, pessoa_id, vencimento, saldo, documento, descricao")
      .eq("academia_id", conta.academia_id)
      .in("situacao", ["aberto", "vencido", "parcial"])
      .limit(2000),
  ]);
  const saldoAnterior = Number(conta.saldo_inicial) + (de > conta.data_saldo_inicial ? antes.reduce((t, m) => t + Number(m.valor), 0) : 0);
  const movimentos = movs as Movimento[];
  const ids = movimentos.map((m) => m.id);
  const { data: baixas } = ids.length
    ? await supabase.from("fin_baixas").select("movimento_id, titulo:fin_titulos(documento, descricao, parcela, parcelas)").in("movimento_id", ids)
    : { data: [] };
  const pessoa = new Map(listas.pessoas.map((x) => [x.id, nomePessoa(x)]));
  const categoria = new Map(listas.categorias.map((c) => [c.id, c.nome]));
  const linhas: LinhaExtrato[] = movimentos.map((m) => ({
    id: m.id,
    data: m.data,
    valor: Number(m.valor),
    descricao: m.descricao,
    pessoa: m.pessoa_id ? (pessoa.get(m.pessoa_id) ?? "") : "",
    pessoa_id: m.pessoa_id,
    categoria: m.categoria_id ? (categoria.get(m.categoria_id) ?? "") : "",
    categoria_id: m.categoria_id,
    origem: m.origem,
    conciliado: m.conciliado,
    titulos: (baixas ?? [])
      .filter((b) => b.movimento_id === m.id)
      .map((b) => {
        const t = b.titulo as unknown as { documento: string | null; descricao: string | null; parcela: number; parcelas: number } | null;
        return t ? [t.documento && `NF ${t.documento}`, t.descricao, t.parcelas > 1 && `${t.parcela}/${t.parcelas}`].filter(Boolean).join(" ") || "Título" : "Título";
      }),
  }));
  const abertos: TituloAberto[] = (abertosData ?? []).map((t) => ({
    id: t.id,
    tipo: t.tipo,
    nome: (t.pessoa_id && pessoa.get(t.pessoa_id)) || t.descricao || "",
    vencimento: t.vencimento,
    saldo: Number(t.saldo),
    documento: t.documento,
  }));
  const pessoas = listas.pessoas.filter((x) => x.ativo).map((x) => ({ id: x.id, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia, documento: x.documento, categoria_padrao_id: x.categoria_padrao_id }));
  const contasOpcoes = contas.map((c) => ({ valor: c.id, rotulo: `${c.nome}${academias.length > 1 ? ` (${nomeAcademia(c.academia_id)})` : ""}` }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Conciliação</h1>
        <p className="text-sm text-slate-500">
          O extrato da conta no sistema: baixas de títulos, lançamentos avulsos e transferências. Confira com o extrato do banco e marque o que
          bateu, ou importe o OFX do banco para conciliar automaticamente (mesmo valor, até 3 dias de diferença).
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" action="/financeiro/conciliacao">
        <label className="text-xs text-slate-600">
          Conta corrente
          <select name="conta" defaultValue={conta.id} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            {contasOpcoes.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          De
          <input type="date" name="de" defaultValue={de} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-600">
          Até
          <input type="date" name="ate" defaultValue={ate} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro">
          Atualizar
        </button>
      </form>
      <Extrato
        key={`${conta.id}-${de}-${ate}`}
        contaId={conta.id}
        contas={contasOpcoes}
        linhas={linhas}
        saldoAnterior={saldoAnterior}
        pessoas={pessoas}
        categorias={listas.opcoesCategoria()}
        abertos={abertos}
      />
    </div>
  );
}
