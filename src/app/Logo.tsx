// Logo provisório em texto. Quando houver o arquivo oficial da BFIT, troque por <Image> aqui
// e todas as telas (login, menu, carregando) passam a usar o novo logo.
export function Logo({
  variante = "completo",
  fundo = "escuro",
  className = "",
}: {
  variante?: "completo" | "icone";
  fundo?: "escuro" | "claro";
  className?: string;
}) {
  const cor = fundo === "escuro" ? "text-white" : "text-grafite";
  if (variante === "icone") {
    return <span className={`font-black tracking-tight text-marca-claro ${className}`}>B</span>;
  }
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className={`text-3xl font-black tracking-tight ${cor}`}>
        B<span className="text-marca-claro">FIT</span>
      </span>
      <span className={`mt-1 text-[11px] uppercase tracking-[0.2em] ${fundo === "escuro" ? "text-slate-400" : "text-slate-500"}`}>
        Controle de unidades
      </span>
    </span>
  );
}
