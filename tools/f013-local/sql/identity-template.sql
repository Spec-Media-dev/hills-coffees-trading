create schema f013_local;
revoke all on schema f013_local from public;

create table f013_local.identity (
  id boolean primary key default true check (id),
  nonce text not null check (nonce ~ '^[a-f0-9]{64}$')
);

insert into f013_local.identity (id, nonce)
values (true, '__F013_NONCE__');
