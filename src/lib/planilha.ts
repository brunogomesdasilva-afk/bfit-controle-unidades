import { getPerfilAtual } from "@/lib/auth";

// Data de hoje no fuso de Brasília, no formato do banco (aaaa-mm-dd).
export function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Dia anterior a hoje (fuso de Brasília), no formato aaaa-mm-dd.
export function ontem() {
  const [a, m, d] = hoje().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

// Converte o que veio da planilha: texto aparado (vazio vira null) e datas no formato aaaa-mm-dd.
export function texto(valor: string | undefined, limite = 500) {
  const v = (valor ?? "").trim().slice(0, limite);
  return v || null;
}

export function data(valor: string | undefined) {
  const v = (valor ?? "").trim();
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; // undefined = data inválida
}

// Número digitado no padrão brasileiro ("1.234,56") ou com ponto decimal ("1234.56").
// Devolve null se vazio e undefined se inválido ou negativo.
export function numero(valor: string | undefined, { inteiro = false } = {}) {
  let v = (valor ?? "").trim().replace(/^R\$\s*/, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ""); // "1.200" = mil e duzentos
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  if (inteiro && !Number.isInteger(n)) return undefined;
  return n;
}

// Horário no formato hh:mm, sempre de 30 em 30 minutos (08:00, 08:30...).
export function hora(valor: string | undefined) {
  const v = (valor ?? "").trim();
  if (!v) return null;
  return /^([01]\d|2[0-3]):(00|30)(:00)?$/.test(v) ? v.slice(0, 5) : undefined;
}

// Validação dos campos que chegam da planilha, conforme o tipo de cada um.
export type CampoValidado = {
  campo: string;
  rotulo: string;
  tipo: "texto" | "data" | "hora" | "inteiro" | "decimal";
  obrigatorio?: boolean;
};

export function validar(campos: CampoValidado[], dados: Record<string, string>) {
  const registro: Record<string, string | number | null> = {};
  for (const c of campos) {
    const bruto = dados[c.campo];
    const valor =
      c.tipo === "texto"
        ? texto(bruto, 200)
        : c.tipo === "data"
          ? data(bruto)
          : c.tipo === "hora"
            ? hora(bruto)
            : numero(bruto, { inteiro: c.tipo === "inteiro" });
    if (valor === undefined) {
      const dica =
        c.tipo === "inteiro" ? " Use um número inteiro." : c.tipo === "hora" ? " Escolha um horário da lista (de 30 em 30 minutos)." : "";
      return { erro: `“${c.rotulo}” inválido.${dica}` };
    }
    if (valor === null && c.obrigatorio) return { erro: `Preencha “${c.rotulo}”.` };
    registro[c.campo] = valor;
  }
  return { registro };
}

// Mês exibido nas telas de frequência (aaaa-mm). Por padrão, o mês atual.
export function lerMes(valor: string | undefined) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : hoje().slice(0, 7);
}

export function intervaloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, "0")}` };
}

// Mensagem amigável para os erros mais comuns do banco.
export function mensagemErro(erro: { code?: string; message: string }) {
  if (erro.code === "23503") return "Não é possível excluir: existem outros registros ligados a este (lançamentos, usuários ou avaliações).";
  if (erro.code === "23505") return "Já existe um lançamento para esta data nesta academia. Altere a linha existente.";
  if (erro.code === "42501") return "Você não tem permissão para esta ação.";
  return erro.message;
}

// Server Actions chamadas pela planilha devolvem o erro em vez de redirecionar.
export async function verificarAcesso(somenteAdmin = false) {
  const atual = await getPerfilAtual();
  if (!atual) return "Sua sessão expirou. Entre novamente.";
  if (somenteAdmin && atual.perfil !== "admin") return "Só o administrador pode fazer isso.";
  return null;
}
