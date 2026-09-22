import { Logo } from "@/app/Logo";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { erro, ok } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-grafite-escuro px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-center bg-grafite px-8 py-8">
          <Logo className="items-center" />
        </div>

        <div className="p-8">
          <h1 className="text-lg font-semibold text-slate-900">Acesso ao sistema</h1>
          <p className="mt-1 text-sm text-slate-500">
            Entre com sua conta para acessar o controle de unidades.
          </p>

          {erro && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
          )}
          {ok && (
            <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>
          )}

          <form action={login} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
            >
              Entrar
            </button>
          </form>

          <a
            href="/login/esqueci-senha"
            className="mt-4 block text-center text-sm text-slate-500 underline hover:text-slate-900"
          >
            Esqueci minha senha
          </a>
        </div>
      </div>
    </div>
  );
}
