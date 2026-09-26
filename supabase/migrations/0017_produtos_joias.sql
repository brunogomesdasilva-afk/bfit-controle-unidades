-- Menu Thais: cadastro de produtos de joias (um registro por SKU).
-- Preço ao consumidor, margem e valor de reposição são calculados pelo banco a partir do custo e do markup.
-- Só o administrador vê e altera.

create table if not exists produtos_joias (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  descricao text,
  data_fabricacao date,
  tipo_banho text,
  ouro_milesimos numeric(8, 2) check (ouro_milesimos >= 0),
  preco_custo numeric(12, 2) not null check (preco_custo >= 0),
  markup numeric(6, 2) not null check (markup > 0),
  -- Preço ao consumidor final = custo × markup
  preco_venda numeric(12, 2) generated always as (round(preco_custo * markup, 2)) stored,
  -- Margem = preço de venda − custo (em R$ e em % do preço de venda)
  margem_valor numeric(12, 2) generated always as (round(preco_custo * markup, 2) - preco_custo) stored,
  margem_percentual numeric generated always as (
    case when preco_custo * markup > 0 then (preco_custo * markup - preco_custo) / (preco_custo * markup) end
  ) stored,
  -- Valor a destinar à compra de matéria-prima para repor a peça vendida
  reposicao numeric(12, 2) generated always as (preco_custo) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_produtos_joias_updated_at on produtos_joias;
create trigger trg_produtos_joias_updated_at before update on produtos_joias
  for each row execute function set_updated_at();

alter table produtos_joias enable row level security;
drop policy if exists "produtos_joias_admin" on produtos_joias;
create policy "produtos_joias_admin" on produtos_joias for all to authenticated
  using (is_admin()) with check (is_admin());
