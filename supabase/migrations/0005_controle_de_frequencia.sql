-- Controle de frequência: controle diário (indicadores do dia) e as contagens de sala, coletivas e lutas.
-- Os campos calculados (ICV, churn, previsão de churn) são colunas geradas pelo próprio banco: se atualizam
-- sozinhos quando os campos de origem mudam e ninguém consegue alterá-los diretamente.

create table if not exists controle_diario (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  ativos_pagantes integer check (ativos_pagantes >= 0),
  visitas integer check (visitas >= 0),
  vendas integer check (vendas >= 0),
  inadimplentes integer check (inadimplentes >= 0),
  faturamento numeric(14, 2) check (faturamento >= 0),
  cancelamentos_solicitados integer check (cancelamentos_solicitados >= 0),
  cancelamentos_efetivados integer check (cancelamentos_efetivados >= 0),
  nps numeric(6, 2),
  auditoria numeric(6, 2),
  neoassist integer check (neoassist >= 0),
  vendas_site integer check (vendas_site >= 0),
  -- ICV % = vendas / visitas
  icv numeric generated always as (case when visitas > 0 then vendas::numeric / visitas end) stored,
  -- Churn = cancelamentos efetivados / ativos pagantes
  churn numeric generated always as (
    case when ativos_pagantes > 0 then cancelamentos_efetivados::numeric / ativos_pagantes end
  ) stored,
  -- Previsão de churn = cancelamentos solicitados / ativos pagantes
  previsao_churn numeric generated always as (
    case when ativos_pagantes > 0 then cancelamentos_solicitados::numeric / ativos_pagantes end
  ) stored,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academia_id, data)
);

-- Contagem de sala: quantas pessoas na musculação e no cardio em cada horário
create table if not exists contagem_sala (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  horario time not null,
  musculacao integer not null default 0 check (musculacao >= 0),
  cardio integer not null default 0 check (cardio >= 0),
  professores integer check (professores >= 0),
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contagem de aulas coletivas
create table if not exists contagem_coletivas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  horario time not null,
  professor text,
  modalidade text,
  quantidade integer not null default 0 check (quantidade >= 0),
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contagem de aulas de lutas
create table if not exists contagem_lutas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  horario time not null,
  professor text,
  modalidade text,
  quantidade integer not null default 0 check (quantidade >= 0),
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contagem_sala_academia_data on contagem_sala(academia_id, data);
create index if not exists idx_contagem_coletivas_academia_data on contagem_coletivas(academia_id, data);
create index if not exists idx_contagem_lutas_academia_data on contagem_lutas(academia_id, data);

-- updated_at automático e regras de acesso iguais às de compras: administrador vê tudo;
-- usuário só a academia do seu acesso; excluir só o administrador.
do $$
declare
  t text;
begin
  foreach t in array array['controle_diario', 'contagem_sala', 'contagem_coletivas', 'contagem_lutas'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s for each row execute function set_updated_at()', t);

    execute format('alter table %1$s enable row level security', t);

    execute format('drop policy if exists "%1$s_select" on %1$s', t);
    execute format(
      'create policy "%1$s_select" on %1$s for select to authenticated using (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_insert" on %1$s', t);
    execute format(
      'create policy "%1$s_insert" on %1$s for insert to authenticated with check (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_update" on %1$s', t);
    execute format(
      'create policy "%1$s_update" on %1$s for update to authenticated using (is_admin() or academia_id = minha_academia()) with check (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_delete" on %1$s', t);
    execute format('create policy "%1$s_delete" on %1$s for delete to authenticated using (is_admin())', t);
  end loop;
end $$;
