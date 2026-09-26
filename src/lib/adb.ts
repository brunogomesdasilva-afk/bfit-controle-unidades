// A.D.B (Avaliação de Desempenho): questionários da planilha "A.D.B 2026" (abas "Avaliação Professores"
// e "Avaliação Recepção"). As perguntas 2 e 3 mudam entre os dois; as demais são iguais.

export type Questionario = "professores" | "recepcao";

// curto: nome reduzido usado nas tabelas; titulo e descricao aparecem só no formulário da avaliação.
export type Pergunta = { titulo: string; curto: string; descricao: string };

const ENGAJAMENTO: Pergunta = {
  titulo: "Engajamento institucional",
  curto: "Engajamento",
  descricao:
    "Demonstra comprometimento com a empresa, envolvimento em Programas, Projetos e Treinamentos. Participa das reuniões? Aborda o aluno referente ao NPS? Participa dos treinamentos internos? Participa dos treinamentos da franqueadora? Está antenado no dia a dia da unidade como um todo, nos demais departamentos?",
};

const PONTUALIDADE: Pergunta = {
  titulo: "Pontualidade, assiduidade, apresentação pessoal",
  curto: "Pontualidade",
  descricao:
    "Cumpre a jornada de trabalho pré-estabelecida sem atrasos. Cumpre corretamente os horários de entrada, saída e intervalo? Tenta ao máximo marcar seus compromissos fora do horário de trabalho? Tem boa apresentação pessoal e utiliza o uniforme de acordo com sua atividade?",
};

const TRABALHO_EM_EQUIPE: Pergunta = {
  titulo: "Trabalho em equipe",
  curto: "Equipe",
  descricao:
    "Tem habilidade de manter bom relacionamento com seus pares, superiores, subordinados (se houver) e colaboradores de outras áreas. Demonstra proatividade no dia a dia. Demonstra ética e espírito de cooperação.",
};

const COMUNICACAO: Pergunta = {
  titulo: "Comunicação",
  curto: "Comunicação",
  descricao: "Demonstra clareza, objetividade e assertividade na comunicação, tanto interna quanto externamente.",
};

const ORGANIZACAO: Pergunta = {
  titulo: "Organização",
  curto: "Organização",
  descricao: "O colaborador demonstra organização nas atividades; seu posto de trabalho está sempre limpo e organizado.",
};

const MATERIAIS: Pergunta = {
  titulo: "Utilização de materiais, equipamentos e eletrônicos",
  curto: "Materiais",
  descricao:
    "Cuidados com materiais e equipamentos, na conservação, quantidades utilizadas e aproveitamento total antes do descarte. Usa de maneira consciente o celular no horário de trabalho.",
};

export const QUESTIONARIOS: Record<Questionario, { nome: string; perguntas: Pergunta[] }> = {
  professores: {
    nome: "Professores",
    perguntas: [
      ENGAJAMENTO,
      {
        titulo: "Qualidade do atendimento",
        curto: "Atendimento",
        descricao:
          "Habilidade que tem em contribuir para atingir o nível de eficácia desejado. Recepciona bem os alunos? Sabe abordar um cliente em sala? Realiza a setorização e o e.r.e de forma correta?",
      },
      {
        titulo: "Habilidade técnica e desenvolvimento",
        curto: "Hab. técnica",
        descricao:
          "Conhecimento de procedimentos, sistemas, normas e padrões internos necessários para exercer sua atividade. Entende a necessidade e cumpre as diretrizes internas (e.r.e, setorização, treinos com aulas coletivas)? Consegue contornar as situações rústicas com clientes, mesmo estando na razão da situação? Sabe a importância e os benefícios das aulas coletivas? Tem planos de atualizações, certificações?",
      },
      PONTUALIDADE,
      TRABALHO_EM_EQUIPE,
      COMUNICACAO,
      ORGANIZACAO,
      MATERIAIS,
    ],
  },
  recepcao: {
    nome: "Recepção",
    perguntas: [
      ENGAJAMENTO,
      {
        titulo: "Qualidade do atendimento",
        curto: "Atendimento",
        descricao:
          "Habilidade que tem em contribuir para atingir o nível de eficácia desejado. Recepciona bem os alunos? Sabe abordar um cliente diante de um cancelamento? Entende a necessidade e a forma de apresentar a academia a um novo cliente?",
      },
      {
        titulo: "Habilidade técnica",
        curto: "Hab. técnica",
        descricao:
          "Conhecimento de procedimentos, sistemas, normas e padrões internos necessários para exercer sua atividade. Entende a necessidade e cumpre as diretrizes internas (contrato assinado, cartão de terceiros, menores etc.)? Consegue contornar as situações rústicas com clientes, mesmo estando na razão da situação? Tem planos de atualizações, certificações?",
      },
      PONTUALIDADE,
      TRABALHO_EM_EQUIPE,
      COMUNICACAO,
      ORGANIZACAO,
      MATERIAIS,
    ],
  },
};

export const PERGUNTAS_ABERTAS = [
  { campo: "stop", titulo: "STOP", descricao: "O que você considera que o colaborador faz atualmente e deveria deixar de fazer?" },
  { campo: "start", titulo: "START", descricao: "O que você considera que o colaborador não faz atualmente e deveria começar a fazer?" },
  { campo: "continuar", titulo: "CONTINUE", descricao: "O que você considera que o colaborador faz atualmente e deve continuar a fazer?" },
] as const;

export const CONCEITOS: Record<number, string> = { 5: "Excelente", 4: "Bom", 3: "Regular", 2: "Ruim", 1: "Péssimo" };

// Questionário de cada departamento. Gerente e Limpeza não têm questionário na planilha, e professores de
// coletivas e de lutas não entram na A.D.B (regra do Bruno).
export function questionarioDoDepartamento(departamento: string): Questionario | null {
  if (departamento === "recepcao") return "recepcao";
  if (["professores", "estagiario"].includes(departamento)) return "professores";
  return null;
}

// Período de trabalho a partir do horário de entrada, como na linha "Período" da planilha.
export function periodoDoHorario(entrada: string | null) {
  if (!entrada) return "";
  const hora = Number(entrada.slice(0, 2));
  return hora < 12 ? "Matutino" : hora < 18 ? "Vespertino" : "Noturno";
}

export const NOTAS = ["nota_1", "nota_2", "nota_3", "nota_4", "nota_5", "nota_6", "nota_7", "nota_8"] as const;

export type Avaliacao = {
  id: string;
  academia_id: string;
  funcionario_id: string;
  mes: string;
  questionario: Questionario;
  media: number;
  stop: string | null;
  start: string | null;
  continuar: string | null;
  criado_por: string | null;
  atualizado_por: string | null;
} & Record<(typeof NOTAS)[number], number>;
