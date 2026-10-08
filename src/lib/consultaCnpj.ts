// Cadastro de um CNPJ na Receita Federal (dados públicos do CNPJ), para a conferência de pagamentos validar o
// regime do prestador (MEI, Simples, demais) e as retenções das notas. Fonte: BrasilAPI; se ela falhar, CNPJ.ws.

export type CadastroCnpj = {
  cnpj: string;
  fonte: string;
  razao_social: string;
  nome_fantasia: string | null;
  situacao_cadastral: string;
  data_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  cnae_principal: string;
  cnaes_secundarios: string[];
  simples: { optante: boolean | null; data_opcao: string | null; data_exclusao: string | null };
  mei: { optante: boolean | null; data_opcao: string | null; data_exclusao: string | null };
  municipio: string;
  socios: string[];
};

const simNao = (v: unknown) => (v === true || v === "Sim" || v === "S" ? true : v === false || v === "Não" || v === "N" ? false : null);
const ESPERA_MS = 15000;

async function json(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "BFIT-controle-unidades" }, signal: AbortSignal.timeout(ESPERA_MS) });
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
  return r.json();
}

async function brasilApi(cnpj: string): Promise<CadastroCnpj> {
  const d = await json(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  return {
    cnpj,
    fonte: "BrasilAPI (base pública do CNPJ da Receita Federal)",
    razao_social: d.razao_social,
    nome_fantasia: d.nome_fantasia || null,
    situacao_cadastral: d.descricao_situacao_cadastral,
    data_situacao_cadastral: d.data_situacao_cadastral,
    data_inicio_atividade: d.data_inicio_atividade,
    natureza_juridica: d.natureza_juridica,
    porte: d.porte,
    cnae_principal: `${d.cnae_fiscal} - ${d.cnae_fiscal_descricao}`,
    cnaes_secundarios: (d.cnaes_secundarios ?? []).filter((c: { codigo: number }) => c.codigo).map((c: { codigo: number; descricao: string }) => `${c.codigo} - ${c.descricao}`),
    simples: { optante: simNao(d.opcao_pelo_simples), data_opcao: d.data_opcao_pelo_simples, data_exclusao: d.data_exclusao_do_simples },
    mei: { optante: simNao(d.opcao_pelo_mei), data_opcao: d.data_opcao_pelo_mei, data_exclusao: d.data_exclusao_do_mei },
    municipio: `${d.municipio}/${d.uf}`,
    socios: (d.qsa ?? []).map((s: { nome_socio: string; qualificacao_socio: string }) => `${s.nome_socio} (${s.qualificacao_socio})`),
  };
}

async function cnpjWs(cnpj: string): Promise<CadastroCnpj> {
  const d = await json(`https://publica.cnpj.ws/cnpj/${cnpj}`);
  const e = d.estabelecimento ?? {};
  return {
    cnpj,
    fonte: "CNPJ.ws (base pública do CNPJ da Receita Federal)",
    razao_social: d.razao_social,
    nome_fantasia: e.nome_fantasia || null,
    situacao_cadastral: e.situacao_cadastral,
    data_situacao_cadastral: e.data_situacao_cadastral,
    data_inicio_atividade: e.data_inicio_atividade,
    natureza_juridica: d.natureza_juridica?.descricao ?? null,
    porte: d.porte?.descricao ?? null,
    cnae_principal: `${e.atividade_principal?.id} - ${e.atividade_principal?.descricao}`,
    cnaes_secundarios: (e.atividades_secundarias ?? []).map((c: { id: string; descricao: string }) => `${c.id} - ${c.descricao}`),
    simples: { optante: simNao(d.simples?.simples), data_opcao: d.simples?.data_opcao_simples ?? null, data_exclusao: d.simples?.data_exclusao_simples ?? null },
    mei: { optante: simNao(d.simples?.mei), data_opcao: d.simples?.data_opcao_mei ?? null, data_exclusao: d.simples?.data_exclusao_mei ?? null },
    municipio: `${e.cidade?.nome}/${e.estado?.sigla}`,
    socios: (d.socios ?? []).map((s: { nome: string; qualificacao_socio?: { descricao: string } }) => `${s.nome} (${s.qualificacao_socio?.descricao?.trim() ?? ""})`),
  };
}

export async function consultarCnpj(entrada: string): Promise<CadastroCnpj | { cnpj: string; erro: string }> {
  const cnpj = entrada.replace(/\D/g, "");
  if (cnpj.length !== 14) return { cnpj: entrada, erro: "CNPJ inválido: precisa ter 14 dígitos." };
  const erros: string[] = [];
  for (const fonte of [brasilApi, cnpjWs]) {
    try {
      return await fonte(cnpj);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { cnpj, erro: `Consulta indisponível (${erros.join("; ")}).` };
}
