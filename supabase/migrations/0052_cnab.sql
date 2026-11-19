-- CNAB (arquivos de remessa para o banco): Financeiro > Cadastros > Parâmetros CNAB guarda, por conta corrente, os
-- dados do convênio de PAGAMENTOS (CNAB 240, pagamento a fornecedores: crédito em conta, TED, PIX, boletos e
-- guias) e de COBRANÇA (CNAB 400, registro de boletos do contas a receber). Financeiro > Relatórios > Gerar lote
-- para o banco monta o arquivo com os títulos escolhidos e guarda cada arquivo gerado no histórico.

create table if not exists fin_cnab_parametros (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references fin_contas(id) on delete cascade,
  tipo text not null check (tipo in ('pagar', 'receber')),
  banco text not null default '237',
  layout text not null default '240' check (layout in ('240', '400')),
  -- Conta do convênio (só números) e a empresa titular.
  agencia text,
  agencia_dv text,
  conta text,
  conta_dv text,
  convenio text, -- código do convênio/empresa informado pelo banco (pagamentos)
  codigo_empresa text, -- código da empresa na cobrança (CNAB 400 Bradesco, 20 dígitos)
  razao_social text,
  cnpj text,
  logradouro text,
  numero text,
  complemento text,
  cidade text,
  cep text,
  uf text,
  -- Pagamentos (CNAB 240 FEBRABAN): versões de layout e finalidade da TED.
  versao_arquivo text not null default '089',
  versao_lote_credito text not null default '045',
  versao_lote_boleto text not null default '040',
  versao_lote_tributo text not null default '012',
  finalidade_ted text not null default '00005',
  -- Cobrança (CNAB 400): carteira, nosso número e instruções.
  carteira text not null default '09',
  proximo_nosso_numero bigint not null default 1,
  multa_percentual numeric(5, 2) not null default 0,
  juros_dia_percentual numeric(6, 3) not null default 0,
  dias_protesto integer not null default 0,
  -- Número sequencial do arquivo (NSA): sobe 1 a cada arquivo gerado.
  ultimo_nsa integer not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references profiles(id) on delete set null,
  unique (conta_id, tipo)
);

create table if not exists fin_cnab_lotes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  conta_id uuid not null references fin_contas(id) on delete cascade,
  nsa integer not null,
  arquivo_nome text not null,
  conteudo text not null,
  quantidade integer not null,
  total numeric(14, 2) not null,
  titulos uuid[] not null default '{}',
  criado_em timestamptz not null default now(),
  criado_por uuid references profiles(id) on delete set null
);
create index if not exists fin_cnab_lotes_data on fin_cnab_lotes (criado_em desc);

-- Títulos: código de barras / linha digitável do boleto ou da guia a pagar, e o nosso número do boleto emitido.
alter table fin_titulos add column if not exists codigo_barras text;
alter table fin_titulos add column if not exists nosso_numero text;

-- A visão lista as colunas do título: é recriada para incluir as novas.
drop view if exists fin_titulos_situacao;
create view fin_titulos_situacao with (security_invoker = true) as
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

-- Acesso: módulo Financeiro (como as contas: fora o administrador, só a própria academia).
alter table fin_cnab_parametros enable row level security;
alter table fin_cnab_lotes enable row level security;
drop policy if exists "fin_cnab_parametros_acesso" on fin_cnab_parametros;
create policy "fin_cnab_parametros_acesso" on fin_cnab_parametros for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin()) or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))))
  with check ((select tem_modulo('financeiro')) and ((select is_admin()) or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))));
drop policy if exists "fin_cnab_lotes_acesso" on fin_cnab_lotes;
create policy "fin_cnab_lotes_acesso" on fin_cnab_lotes for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin()) or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))))
  with check ((select tem_modulo('financeiro')) and ((select is_admin()) or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))));
