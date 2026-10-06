import { exigirModulo } from "@/lib/auth";

// Módulo Financeiro: menu criado, telas ainda por fazer.
export default async function FinanceiroPage() {
  await exigirModulo("financeiro");
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Financeiro</h1>
      <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Em breve: as telas do financeiro vão aparecer aqui.</p>
    </div>
  );
}
