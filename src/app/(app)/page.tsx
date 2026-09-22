import { getPerfilAtual } from "@/lib/auth";

export default async function PainelPage() {
  const atual = await getPerfilAtual();

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Painel</h1>
      <p className="mt-1 text-sm text-slate-500">Olá, {atual?.nome}. As telas do controle de unidades entram aqui.</p>
    </div>
  );
}
