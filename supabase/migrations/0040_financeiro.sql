-- Módulo Financeiro: cadastro de clientes e fornecedores, categorias, contas bancárias, contas a pagar e a
-- receber (títulos, com baixas parciais) e o extrato de cada conta (conciliação).
-- Clientes/fornecedores e categorias valem para o grupo todo (quem tem o módulo Financeiro); contas bancárias,
-- títulos e extrato são de cada academia (o usuário vê a dele; o administrador, todas).

-- ------------------------------------------------------------------ Clientes e fornecedores (uma tabela só)
create table if not exists fin_pessoas (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null default 'PJ' check (tipo_pessoa in ('PF', 'PJ')),
  documento text, -- CPF ou CNPJ, só números
  razao_social text not null,
  nome_fantasia text,
  cliente boolean not null default false,
  fornecedor boolean not null default true,
  inscricao_estadual text,
  inscricao_municipal text,
  regime_tributario text check (regime_tributario in ('MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Pessoa Física', 'Outro')),
  cnae text,
  email text,
  telefone text,
  contato text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  banco text,
  agencia text,
  conta text,
  tipo_conta text check (tipo_conta in ('Corrente', 'Poupança', 'Pagamento')),
  titular_conta text,
  chave_pix text,
  tipo_chave_pix text check (tipo_chave_pix in ('CPF/CNPJ', 'E-mail', 'Celular', 'Aleatória')),
  categoria_padrao_id uuid,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists fin_pessoas_documento on fin_pessoas (documento) where documento is not null and documento <> '';
create index if not exists fin_pessoas_nome on fin_pessoas (lower(coalesce(nome_fantasia, razao_social)));

-- ------------------------------------------------------------------ Categorias (plano de contas gerencial)
create table if not exists fin_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo text not null,
  tipo text not null check (tipo in ('receita', 'despesa', 'transferencia')),
  ativo boolean not null default true,
  unique (nome, tipo)
);
alter table fin_pessoas drop constraint if exists fin_pessoas_categoria_padrao_fk;
alter table fin_pessoas add constraint fin_pessoas_categoria_padrao_fk foreign key (categoria_padrao_id) references fin_categorias(id) on delete set null;

-- ------------------------------------------------------------------ Contas bancárias (e caixa) de cada academia
create table if not exists fin_contas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  nome text not null, -- ex.: "Bradesco Continental"
  tipo text not null default 'Corrente' check (tipo in ('Corrente', 'Aplicação', 'Caixa', 'Cartão de crédito', 'Outra')),
  banco text,
  agencia text,
  conta text,
  saldo_inicial numeric(14, 2) not null default 0,
  data_saldo_inicial date not null default current_date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (academia_id, nome)
);

-- ------------------------------------------------------------------ Títulos: contas a pagar e a receber (mesmos campos)
create table if not exists fin_titulos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  academia_id uuid not null references academias(id) on delete restrict,
  pessoa_id uuid references fin_pessoas(id) on delete restrict,
  categoria_id uuid references fin_categorias(id) on delete restrict,
  conta_id uuid references fin_contas(id) on delete set null, -- conta prevista para pagar/receber
  descricao text,
  documento text, -- nº da nota fiscal, boleto, fatura
  data_emissao date,
  data_registro date not null default current_date,
  vencimento date not null,
  previsao date, -- previsão de pagamento/recebimento (padrão: vencimento)
  valor numeric(14, 2) not null check (valor > 0),
  parcela integer not null default 1,
  parcelas integer not null default 1,
  grupo_parcelas uuid, -- parcelas do mesmo lançamento
  -- Retenções destacadas na nota (informativo; o valor do título é o líquido a pagar/receber).
  ret_iss numeric(14, 2) not null default 0,
  ret_irrf numeric(14, 2) not null default 0,
  ret_inss numeric(14, 2) not null default 0,
  ret_pis numeric(14, 2) not null default 0,
  ret_cofins numeric(14, 2) not null default 0,
  ret_csll numeric(14, 2) not null default 0,
  observacoes text,
  cancelado boolean not null default false,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists fin_titulos_busca on fin_titulos (academia_id, tipo, vencimento);
create index if not exists fin_titulos_pessoa on fin_titulos (pessoa_id);

-- ------------------------------------------------------------------ Extrato das contas (lançamentos e conciliação)
create table if not exists fin_movimentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references fin_contas(id) on delete restrict,
  data date not null,
  valor numeric(14, 2) not null check (valor <> 0), -- entrada positiva, saída negativa
  descricao text,
  pessoa_id uuid references fin_pessoas(id) on delete set null,
  categoria_id uuid references fin_categorias(id) on delete set null,
  origem text not null default 'manual' check (origem in ('manual', 'baixa', 'transferencia', 'extrato')),
  transferencia_id uuid, -- os dois lados de uma transferência entre contas
  conciliado boolean not null default false,
  conciliado_em timestamptz,
  id_banco text, -- identificador da linha no extrato do banco (OFX), para não importar duas vezes
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists fin_movimentos_conta on fin_movimentos (conta_id, data);
create unique index if not exists fin_movimentos_id_banco on fin_movimentos (conta_id, id_banco) where id_banco is not null;

-- ------------------------------------------------------------------ Baixas (pagamentos/recebimentos, inclusive parciais)
create table if not exists fin_baixas (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references fin_titulos(id) on delete cascade,
  data date not null,
  valor numeric(14, 2) not null check (valor > 0), -- quanto abate do saldo do título
  juros numeric(14, 2) not null default 0 check (juros >= 0),
  multa numeric(14, 2) not null default 0 check (multa >= 0),
  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  conta_id uuid not null references fin_contas(id) on delete restrict,
  forma text check (forma in ('PIX', 'Boleto', 'TED/DOC', 'Débito automático', 'Cartão', 'Dinheiro', 'Cheque', 'Outra')),
  movimento_id uuid references fin_movimentos(id) on delete set null, -- lançamento no extrato da conta
  observacoes text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists fin_baixas_titulo on fin_baixas (titulo_id);

-- Situação do título: total, baixado, saldo e situação (aberto, parcial, liquidado, vencido, cancelado).
create or replace view fin_titulos_situacao with (security_invoker = true) as
select
  t.*,
  coalesce(b.baixado, 0) as baixado,
  coalesce(b.pago, 0) as pago,
  b.ultima_baixa,
  greatest(t.valor - coalesce(b.baixado, 0), 0) as saldo,
  case
    when t.cancelado then 'cancelado'
    when coalesce(b.baixado, 0) >= t.valor then 'liquidado'
    when coalesce(b.baixado, 0) > 0 then 'parcial'
    when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    else 'aberto'
  end as situacao
from fin_titulos t
left join (
  select titulo_id, sum(valor + desconto) as baixado, sum(valor + juros + multa) as pago, max(data) as ultima_baixa
  from fin_baixas group by titulo_id
) b on b.titulo_id = t.id;

-- ------------------------------------------------------------------ Acesso
create or replace function pode_financeiro_conta(conta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fin_contas c where c.id = conta and pode_financeiro(c.academia_id));
$$;
revoke execute on function pode_financeiro_conta(uuid) from public;
grant execute on function pode_financeiro_conta(uuid) to authenticated;

create or replace function pode_financeiro_titulo(titulo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fin_titulos t where t.id = titulo and pode_financeiro(t.academia_id));
$$;
revoke execute on function pode_financeiro_titulo(uuid) from public;
grant execute on function pode_financeiro_titulo(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_categorias', 'fin_contas', 'fin_titulos', 'fin_movimentos', 'fin_baixas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "manutencao_bloqueia" on %I', t);
    execute format(
      'create policy "manutencao_bloqueia" on %I as restrictive for all to authenticated '
      'using (not (select em_manutencao()) or (select is_admin())) '
      'with check (not (select em_manutencao()) or (select is_admin()))', t);
    execute format('drop policy if exists "%s_acesso" on %I', t, t);
  end loop;
end $$;

create policy "fin_pessoas_acesso" on fin_pessoas for all to authenticated
  using ((select tem_modulo('financeiro'))) with check ((select tem_modulo('financeiro')));
create policy "fin_categorias_acesso" on fin_categorias for all to authenticated
  using ((select tem_modulo('financeiro'))) with check ((select tem_modulo('financeiro')));
create policy "fin_contas_acesso" on fin_contas for all to authenticated
  using ((select pode_financeiro(academia_id))) with check ((select pode_financeiro(academia_id)));
create policy "fin_titulos_acesso" on fin_titulos for all to authenticated
  using ((select pode_financeiro(academia_id))) with check ((select pode_financeiro(academia_id)));
create policy "fin_movimentos_acesso" on fin_movimentos for all to authenticated
  using ((select pode_financeiro_conta(conta_id))) with check ((select pode_financeiro_conta(conta_id)));
create policy "fin_baixas_acesso" on fin_baixas for all to authenticated
  using ((select pode_financeiro_titulo(titulo_id))) with check ((select pode_financeiro_titulo(titulo_id)));

-- ------------------------------------------------------------------ Categorias iniciais (as do fluxo financeiro atual)
insert into fin_categorias (nome, grupo, tipo) values
  ('Clientes - Venda a Crédito', 'Receitas Diretas', 'receita'),
  ('Clientes - Venda a Débito', 'Receitas Diretas', 'receita'),
  ('Clientes - Gympass', 'Receitas Diretas', 'receita'),
  ('Rendimentos de Aplicações', 'Receitas Indiretas', 'receita'),
  ('Aporte sócios', 'Outras Entradas', 'receita'),
  ('Empréstimos Bancários', 'Outras Entradas', 'receita'),
  ('Reembolso de Despesas', 'Outras Entradas', 'receita'),
  ('Venda de Ativos', 'Outras Entradas', 'receita'),
  ('Outras Entradas', 'Outras Entradas', 'receita'),
  ('Devoluções de Compra', 'Devoluções', 'receita'),
  ('Transferência entre contas', 'Transferências', 'transferencia'),
  ('Aplicação Financeira', 'Transferências', 'transferencia'),
  ('Aluguel/IPTU/Condominio', 'Custo com Operação', 'despesa'),
  ('Água e Esgoto', 'Custo com Operação', 'despesa'),
  ('Energia elétrica e gás', 'Custo com Operação', 'despesa'),
  ('Internet e Telefonia', 'Custo com Operação', 'despesa'),
  ('Licenças e Taxas', 'Custo com Operação', 'despesa'),
  ('CREF', 'Custo com Operação', 'despesa'),
  ('Servicos de Manobrista', 'Custo com Operação', 'despesa'),
  ('Royalties', 'Custos com Franquia', 'despesa'),
  ('Fundo de Propaganda e Marketing', 'Custos com Franquia', 'despesa'),
  ('Taxa de Franquia', 'Custos com Franquia', 'despesa'),
  ('SisBlue', 'Custos com Franquia', 'despesa'),
  ('Evo', 'Custos com Franquia', 'despesa'),
  ('Vindi', 'Custos com Franquia', 'despesa'),
  ('NPS - WeHelp', 'Custos com Franquia', 'despesa'),
  ('Less Mills', 'Custos com Franquia', 'despesa'),
  ('Salários', 'Despesas com Pessoal', 'despesa'),
  ('13º Salário', 'Despesas com Pessoal', 'despesa'),
  ('Férias', 'Despesas com Pessoal', 'despesa'),
  ('Rescisões', 'Despesas com Pessoal', 'despesa'),
  ('PROVISÃO 13 RESCISÕES E FÉRIAS', 'Despesas com Pessoal', 'despesa'),
  ('Adiantamento', 'Despesas com Pessoal', 'despesa'),
  ('INSS', 'Despesas com Pessoal', 'despesa'),
  ('FGTS', 'Despesas com Pessoal', 'despesa'),
  ('IRRF', 'Despesas com Pessoal', 'despesa'),
  ('Vale Transporte', 'Despesas com Pessoal', 'despesa'),
  ('Vale Refeição', 'Despesas com Pessoal', 'despesa'),
  ('Assistência Médica', 'Despesas com Pessoal', 'despesa'),
  ('Saúde ocupacional', 'Despesas com Pessoal', 'despesa'),
  ('Seguro de Vida', 'Despesas com Pessoal', 'despesa'),
  ('Outros Benefícios', 'Despesas com Pessoal', 'despesa'),
  ('Material/Serviços para Manutenção', 'Despesas Administrativas', 'despesa'),
  ('Material/Serviços de Limpeza', 'Despesas Administrativas', 'despesa'),
  ('Material/Serviços de Escritório', 'Despesas Administrativas', 'despesa'),
  ('Material/Serviços de Informática', 'Despesas Administrativas', 'despesa'),
  ('Serviços Administrativos', 'Despesas Administrativas', 'despesa'),
  ('Contabilidade', 'Despesas Administrativas', 'despesa'),
  ('Advogados', 'Despesas Administrativas', 'despesa'),
  ('Seguros', 'Despesas Administrativas', 'despesa'),
  ('Cartao de Credito', 'Despesas Administrativas', 'despesa'),
  ('Cappta', 'Despesas Administrativas', 'despesa'),
  ('Publicidade e Propaganda', 'Despesas de Vendas e Marketing', 'despesa'),
  ('Comunicação', 'Despesas de Vendas e Marketing', 'despesa'),
  ('Bonificações', 'Despesas de Vendas e Marketing', 'despesa'),
  ('ISS', 'Impostos e Taxas', 'despesa'),
  ('PIS', 'Impostos e Taxas', 'despesa'),
  ('COFINS', 'Impostos e Taxas', 'despesa'),
  ('Impostos Pagos de terceiros', 'Impostos e Taxas', 'despesa'),
  ('IRPJ', 'Imposto sobre Lucro', 'despesa'),
  ('CSLL', 'Imposto sobre Lucro', 'despesa'),
  ('Tarifas Bancárias', 'Despesas Financeiras / Bancos', 'despesa'),
  ('Juros sobre Empréstimos', 'Despesas Financeiras / Bancos', 'despesa'),
  ('Tarifa - Juros e IOF Sobre Antecipação', 'Despesas Financeiras / Bancos', 'despesa'),
  ('Pagamento de Empréstimos', 'Despesas Financeiras / Bancos', 'despesa'),
  ('Multas', 'Despesas Financeiras / Bancos', 'despesa'),
  ('Obra', 'Investimento', 'despesa'),
  ('Máquinas e Equipamentos', 'Investimento', 'despesa'),
  ('Móveis e Utensílios', 'Investimento', 'despesa'),
  ('Instalações', 'Investimento', 'despesa'),
  ('Marketing e Divulgação', 'Investimento', 'despesa'),
  ('Retirada Socios', 'Outras Saídas', 'despesa'),
  ('Pró-labore', 'Outras Saídas', 'despesa'),
  ('Devoluções de Vendas de Serviços Prestados', 'Devoluções de Vendas', 'despesa')
on conflict (nome, tipo) do nothing;
