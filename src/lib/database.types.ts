export type Profile = {
  id: string;
  nome: string;
  email: string;
  perfil: "admin" | "usuario" | "manutencao" | "coletivas";
  academia_id: string | null;
  ativo: boolean;
  ativo_alterado_em: string | null;
  ativo_alterado_por: string | null;
  created_at: string;
  // E-mail secundário para os relatórios (vazio = usa o e-mail de acesso).
  email_relatorios: string | null;
  // Celular (WhatsApp) para receber os relatórios, só dígitos com o DDI (ex.: 5511988887777).
  whatsapp: string | null;
  // Perfil Manutenção: unidades que a pessoa atende.
  academias_manutencao: string[];
  // Módulos que o usuário pode usar (academia, rh, financeiro, adm). Ausente se o banco ainda não tiver a coluna.
  modulos?: string[];
};

export type Academia = {
  id: string;
  nome: string;
  area_m2: number | null;
  custo_financeiro: number | null;
  maquinas_peitoral: number;
  maquinas_costas: number;
  maquinas_pernas: number;
  maquinas_cardio: number;
  maquinas_bancos_abdomen: number;
  created_at: string;
};

export type Compra = {
  id: string;
  academia_id: string;
  data_solicitacao: string;
  descricao: string;
  necessario_ate: string | null;
  data_efetivacao: string | null;
  created_at: string;
  updated_at: string;
};

export const TIPOS_MANUTENCAO = {
  predial: "Predial",
  preventiva: "Preventiva",
  corretiva: "Corretiva",
} as const;
export type TipoManutencao = keyof typeof TIPOS_MANUTENCAO;

export type Manutencao = {
  id: string;
  academia_id: string;
  tipo: TipoManutencao;
  data_inclusao: string;
  descricao: string;
  data_finalizacao: string | null;
  created_at: string;
  updated_at: string;
};

export const DEPARTAMENTOS = {
  gerente: "Gerente",
  recepcao: "Recepção",
  professores: "Professores",
  professor_coletivas: "Professor de coletivas",
  professor_lutas: "Professor de lutas",
  estagiario: "Estagiário",
  limpeza: "Limpeza",
} as const;

export const GENEROS = {
  masculino: "Masculino",
  feminino: "Feminino",
} as const;

export type Funcionario = {
  id: string;
  academia_id: string;
  nome: string;
  departamento: keyof typeof DEPARTAMENTOS;
  horario_entrada: string | null;
  horario_saida: string | null;
  genero: keyof typeof GENEROS | null;
  data_nascimento: string | null;
  ativo: boolean;
  cref: string | null;
  cref_vencimento: string | null;
  data_contratacao: string | null;
  ferias_limite: string | null;
  pj: boolean;
  // Valor da hora do professor (PJ: base do pagamento por fora da folha).
  valor_hora: number | null;
  // Dispensado de marcar ponto: a conferência da folha não cobra o ponto dele.
  isento_ponto: boolean;
};

// Departamentos que precisam de CREF (professores de sala e de coletivas).
export const COM_CREF = ["professores", "professor_coletivas"];

// Departamentos de professores: só eles têm a marcação de PJ.
export const PROFESSORES = ["professores", "professor_coletivas", "professor_lutas"];

export type Modalidade = {
  id: string;
  academia_id: string;
  nome: string;
};

// Placeholder mínimo para satisfazer o generic do supabase-js.
// Pode ser substituído pelo `supabase gen types typescript` quando o projeto estiver linkado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
