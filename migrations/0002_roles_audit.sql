-- owner: everything. operator: knowledge base, conversations and overview only.
alter table admin_users add column role text not null default 'owner' check (role in ('owner', 'operator'));

-- Temporarily hide a document from answers without deleting it.
alter table knowledge_documents add column active boolean not null default true;

-- Who changed what in the admin panel.
create table admin_audit (
  id bigserial primary key,
  actor text not null,
  action text not null,
  target text,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on admin_audit(created_at desc);
