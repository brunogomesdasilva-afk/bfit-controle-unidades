-- Escala de fins de semana e feriados (recepção e limpeza) e cadastro de feriados.

-- Feriados: academia_id vazio = feriado nacional (vale para todas as unidades, só o administrador altera);
-- com academia = feriado da cidade daquela unidade. "fechada" = a academia não abre (fica fora da escala).
create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid references academias(id) on delete cascade,
  data date not null,
  nome text not null,
  fechada boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists feriados_unico on feriados (coalesce(academia_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

-- Turnos gerados pela escala. funcionario_id vazio = turno sem pessoa disponível pelas regras.
create table if not exists escala (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  setor text not null check (setor in ('recepcao', 'limpeza', 'professores')),
  inicio time not null,
  fim time not null,
  ordem smallint not null default 1,
  funcionario_id uuid references funcionarios(id) on delete set null,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_escala_academia_data on escala (academia_id, data);

alter table feriados enable row level security;
alter table escala enable row level security;

drop policy if exists "feriados_select" on feriados;
create policy "feriados_select" on feriados for select to authenticated
  using (academia_id is null or is_admin() or academia_id = minha_academia());
drop policy if exists "feriados_write" on feriados;
create policy "feriados_write" on feriados for all to authenticated
  using (is_admin() or (academia_id is not null and academia_id = minha_academia()))
  with check (is_admin() or (academia_id is not null and academia_id = minha_academia()));

drop policy if exists "escala_select" on escala;
create policy "escala_select" on escala for select to authenticated
  using (is_admin() or academia_id = minha_academia());
drop policy if exists "escala_write" on escala;
create policy "escala_write" on escala for all to authenticated
  using (is_admin() or academia_id = minha_academia())
  with check (is_admin() or academia_id = minha_academia());

-- Feriados nacionais (resto de 2026 e 2027). Carnaval é ponto facultativo e fica de fora;
-- feriados da cidade (ex.: Corpus Christi em SP, aniversário da cidade) cada unidade inclui.
insert into feriados (academia_id, data, nome) values
  (null, '2026-10-12', 'Nossa Senhora Aparecida'),
  (null, '2026-11-02', 'Finados'),
  (null, '2026-11-15', 'Proclamação da República'),
  (null, '2026-11-20', 'Dia da Consciência Negra'),
  (null, '2026-12-25', 'Natal'),
  (null, '2027-01-01', 'Confraternização Universal'),
  (null, '2027-03-26', 'Sexta-feira Santa'),
  (null, '2027-04-21', 'Tiradentes'),
  (null, '2027-05-01', 'Dia do Trabalho'),
  (null, '2027-09-07', 'Independência do Brasil'),
  (null, '2027-10-12', 'Nossa Senhora Aparecida'),
  (null, '2027-11-02', 'Finados'),
  (null, '2027-11-15', 'Proclamação da República'),
  (null, '2027-11-20', 'Dia da Consciência Negra'),
  (null, '2027-12-25', 'Natal')
on conflict do nothing;
