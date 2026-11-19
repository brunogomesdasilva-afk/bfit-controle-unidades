"use client";

import { useState, useTransition } from "react";
import { salvarParametrosCnab } from "./acoes";

// Parâmetros CNAB por conta corrente: escolhe a conta e, nela, Pagamentos (CNAB 240) ou Cobrança (CNAB 400).

type Tipo = "pagar" | "receber";
export type ContaCnab = {
  id: string;
  nome: string;
  academia: string;
  pagar: { salvo: boolean; dados: Record<string, string> };
  receber: { salvo: boolean; dados: Record<string, string> };
};
type CampoForm = { campo: string; rotulo: string; largura?: string; dica?: string };

const COMUNS: CampoForm[] = [
  { campo: "banco", rotulo: "Banco (código)", largura: "w-24", dica: "237 = Bradesco" },
  { campo: "agencia", rotulo: "Agência", largura: "w-28" },
  { campo: "agencia_dv", rotulo: "DV ag.", largura: "w-16" },
  { campo: "conta", rotulo: "Conta", largura: "w-36" },
  { campo: "conta_dv", rotulo: "DV conta", largura: "w-20" },
  { campo: "razao_social", rotulo: "Razão social da empresa", largura: "min-w-72 flex-1" },
  { campo: "cnpj", rotulo: "CNPJ", largura: "w-44" },
  { campo: "logradouro", rotulo: "Endereço", largura: "min-w-64 flex-1" },
  { campo: "numero", rotulo: "Número", largura: "w-24" },
  { campo: "complemento", rotulo: "Complemento", largura: "w-40" },
  { campo: "cidade", rotulo: "Cidade", largura: "w-44" },
  { campo: "cep", rotulo: "CEP", largura: "w-32" },
  { campo: "uf", rotulo: "UF", largura: "w-16" },
];
const DO_TIPO: Record<Tipo, CampoForm[]> = {
  pagar: [
    { campo: "convenio", rotulo: "Código do convênio (informado pelo banco)", largura: "min-w-72 flex-1", dica: "No Bradesco: código do convênio do Multipag / Pagamento a Fornecedores" },
    { campo: "versao_arquivo", rotulo: "Versão do arquivo", largura: "w-32" },
    { campo: "versao_lote_credito", rotulo: "Versão lote crédito/TED/PIX", largura: "w-48" },
    { campo: "versao_lote_boleto", rotulo: "Versão lote boletos", largura: "w-40" },
    { campo: "versao_lote_tributo", rotulo: "Versão lote guias", largura: "w-36" },
    { campo: "finalidade_ted", rotulo: "Finalidade da TED", largura: "w-36", dica: "00005 = pagamento a fornecedores" },
    { campo: "ultimo_nsa", rotulo: "Último nº de arquivo (NSA)", largura: "w-48", dica: "Sobe sozinho a cada arquivo gerado" },
  ],
  receber: [
    { campo: "codigo_empresa", rotulo: "Código da empresa na cobrança (20 dígitos)", largura: "min-w-72 flex-1", dica: "Informado pelo banco na contratação da cobrança" },
    { campo: "carteira", rotulo: "Carteira", largura: "w-24", dica: "09 = registrada (padrão Bradesco)" },
    { campo: "proximo_nosso_numero", rotulo: "Próximo nosso número", largura: "w-44" },
    { campo: "multa_percentual", rotulo: "Multa (%)", largura: "w-28" },
    { campo: "juros_dia_percentual", rotulo: "Juros ao dia (%)", largura: "w-32", dica: "0,033 = 1% ao mês" },
    { campo: "dias_protesto", rotulo: "Protestar após (dias)", largura: "w-40", dica: "0 = não protestar" },
    { campo: "ultimo_nsa", rotulo: "Último nº de remessa", largura: "w-40" },
  ],
};

function Formulario({ conta, tipo }: { conta: ContaCnab; tipo: Tipo }) {
  const [d, setD] = useState<Record<string, string>>(conta[tipo].dados);
  const [m, setM] = useState<{ erro?: string; ok?: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const campo = (c: CampoForm) => (
    <label key={c.campo} className={`text-xs text-slate-600 ${c.largura ?? ""}`} title={c.dica}>
      {c.rotulo}
      <input value={d[c.campo] ?? ""} onChange={(e) => setD({ ...d, [c.campo]: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      {c.dica && <span className="mt-0.5 block text-[11px] text-slate-400">{c.dica}</span>}
    </label>
  );
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-marca">Conta e empresa</h3>
        <div className="flex flex-wrap gap-3">{COMUNS.map(campo)}</div>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-marca">{tipo === "pagar" ? "Pagamentos (CNAB 240)" : "Cobrança (CNAB 400 Bradesco)"}</h3>
        <div className="flex flex-wrap gap-3">{DO_TIPO[tipo].map(campo)}</div>
      </section>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={salvando}
          onClick={() => iniciar(async () => setM(await salvarParametrosCnab(conta.id, tipo, d)))}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {m?.ok && <span className="text-sm text-emerald-700">{m.ok}</span>}
        {m?.erro && <span className="text-sm text-red-700">{m.erro}</span>}
      </div>
    </div>
  );
}

export function ParametrosCnab({ contas }: { contas: ContaCnab[] }) {
  const [contaId, setContaId] = useState(contas.find((c) => /bradesco/i.test(c.nome))?.id ?? contas[0]?.id ?? "");
  const [tipo, setTipo] = useState<Tipo>("pagar");
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) return <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Cadastre uma conta corrente em Contas bancárias primeiro.</p>;
  const selo = (salvo: boolean) => (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${salvo ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{salvo ? "configurado" : "a configurar"}</span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {contas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setContaId(c.id)}
            className={`rounded-full px-3 py-1 text-sm ${c.id === contaId ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {c.nome}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex border-b border-slate-200">
          {(["pagar", "receber"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${tipo === t ? "border-marca text-marca" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t === "pagar" ? "Contas a pagar (pagamentos)" : "Contas a receber (cobrança)"} {selo(conta[t].salvo)}
            </button>
          ))}
        </div>
        <div className="p-4">
          {/* key: troca o formulário inteiro ao mudar de conta ou de tipo. */}
          <Formulario key={`${conta.id}-${tipo}`} conta={conta} tipo={tipo} />
        </div>
      </div>
    </div>
  );
}
