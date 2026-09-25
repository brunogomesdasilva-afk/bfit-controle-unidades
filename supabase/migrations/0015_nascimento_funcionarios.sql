-- Data de nascimento no cadastro de funcionários.
alter table funcionarios add column if not exists data_nascimento date
  check (data_nascimento between date '1900-01-01' and current_date);
