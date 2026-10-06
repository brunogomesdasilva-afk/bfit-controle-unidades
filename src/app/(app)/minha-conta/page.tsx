import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth";
import { MODULOS } from "@/lib/modulos";
import { alterarMinhaSenha } from "./actions";

const CAMPO = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  const { erro, ok } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-lg font-semibold text-slate-900">Minha conta</h1>
      <p className="mt-1 text-sm text-slate-500">
        {atual.nome} · {atual.perfil === "admin" ? "Administrador (todas as academias)" : (atual.academiaNome ?? "Sem acesso a academia")} · Módulos:{" "}
        {atual.modulos.length ? atual.modulos.map((m) => MODULOS[m]).join(", ") : "nenhum"}
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Trocar senha</h2>
        <p className="mt-1 text-sm text-slate-500">
          Na próxima vez, entre com a senha nova. Se preferir trocar o nome ou o e-mail, peça a um
          administrador na tela de Usuários.
        </p>

        {erro && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        {ok && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}

        <form action={alterarMinhaSenha} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Senha nova</label>
            <input name="senha" type="password" required minLength={6} autoComplete="new-password" className={CAMPO} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Confirme a senha nova</label>
            <input
              name="confirmacao"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={CAMPO}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
          >
            Salvar senha nova
          </button>
        </form>
      </div>
    </div>
  );
}
