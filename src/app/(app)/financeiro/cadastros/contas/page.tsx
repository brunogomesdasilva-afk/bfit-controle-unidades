import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { TIPOS_CONTA_BANCO, type Conta } from "@/lib/financeiro";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { salvarConta } from "../../acoes";

// Financeiro > Cadastros > Contas bancárias: as contas (e o caixa) de cada academia, usadas nas baixas e na
// conciliação. O saldo inicial é o saldo da conta na data informada (o extrato parte dele).
export default async function ContasPage() {
  await exigirModulo("financeiro");
  const { supabase, academias } = await contextoAcademias(undefined);
  const { data } = await supabase.from("fin_contas").select("*").order("nome");
  const contas = (data ?? []) as Conta[];
  const colunas: Coluna[] = [
    { campo: "academia_id", rotulo: "Academia", tipo: "opcoes", obrigatorio: true, largura: "w-40", opcoes: academias.map((a) => ({ valor: a.id, rotulo: a.nome })) },
    { campo: "nome", rotulo: "Nome da conta", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
    { campo: "tipo", rotulo: "Tipo", tipo: "opcoes", obrigatorio: true, largura: "w-40", opcoes: TIPOS_CONTA_BANCO.map((t) => ({ valor: t, rotulo: t })) },
    { campo: "banco", rotulo: "Banco", tipo: "texto", largura: "w-36" },
    { campo: "agencia", rotulo: "Agência", tipo: "texto", largura: "w-24" },
    { campo: "conta", rotulo: "Conta", tipo: "texto", largura: "w-32" },
    { campo: "saldo_inicial", rotulo: "Saldo inicial", tipo: "texto", largura: "w-32" },
    { campo: "data_saldo_inicial", rotulo: "Saldo em", tipo: "data", obrigatorio: true, largura: "w-36" },
    { campo: "ativa", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] },
  ];
  const linhas: Linha[] = contas.map((c) => ({
    id: c.id,
    academia_id: c.academia_id,
    nome: c.nome,
    tipo: c.tipo,
    banco: c.banco,
    agencia: c.agencia,
    conta: c.conta,
    saldo_inicial: Number(c.saldo_inicial).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    data_saldo_inicial: c.data_saldo_inicial,
    ativa: c.ativa ? "sim" : "nao",
  }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Contas bancárias</h1>
        <p className="text-sm text-slate-500">
          As contas de cada academia (bancos, aplicações e caixa). O saldo inicial é o saldo na data informada: o extrato da
          conciliação parte dele. Saldo negativo: digite com sinal de menos.
        </p>
      </div>
      <Planilha
        colunas={colunas}
        linhas={linhas}
        salvar={salvarConta.bind(null, null)}
        rotuloNovo="+ Incluir conta"
        padroesNovo={{ tipo: "Corrente", ativa: "sim", saldo_inicial: "0,00", ...(academias.length === 1 ? { academia_id: academias[0].id } : {}) }}
        vazio="Nenhuma conta cadastrada."
      />
    </div>
  );
}
