import { Logo } from "@/app/Logo";
import { createClient } from "@/lib/supabase/server";
import { redefinirSenha } from "./actions";

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-grafite-escuro px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-center bg-grafite px-8 py-8">
          <Logo className="items-center" />
        </div>

        <div className="p-8">
          <h1 className="text-lg font-semibold text-slate-900">Nova senha</h1>

          {!user ? (
            <>
              <p className="mt-2 text-sm text-slate-500">
                Este link de redefinição não é mais válido. Peça um novo link em &ldquo;Esqueci minha
                senha&rdquo;.
              </p>
              <a
                href="/login/esqueci-senha"
                className="mt-4 block text-center text-sm text-slate-500 underline hover:text-slate-900"
              >
                Pedir novo link
              </a>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-500">Escolha a nova senha da sua conta.</p>

              {erro && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

              <form action={redefinirSenha} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="senha" className="block text-sm font-medium text-slate-700">
                    Nova senha
                  </label>
                  <input
                    id="senha"
                    name="senha"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="confirmacao" className="block text-sm font-medium text-slate-700">
                    Confirme a nova senha
                  </label>
                  <input
                    id="confirmacao"
                    name="confirmacao"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
                >
                  Salvar nova senha
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
