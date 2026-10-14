-- Avani Pro · 009_messages_live.sql
-- Met la messagerie (fil de discussion, reactions, marquage lu) et les groupes publics
-- a l'etat reellement exploitable par le client :
--   1. les colonnes que l'application lit deja mais que la base ne porte pas ;
--   2. les droits d'ecriture absents (editer, supprimer, marquer lu, reagir, rejoindre) ;
--   3. le tri des conversations par activite, tenu par un trigger ;
--   4. le canal Direct (Realtime) pour les tables qui n'y sont pas encore.
--
-- A executer dans le SQL Editor de Supabase (Dashboard > SQL > New). Le script est
-- idempotent : il peut etre relance sans erreur, et ne modifie aucune donnee existante.
-- Rien dans l'application n'execute ce fichier.

-- ---------------------------------------------------------------------------
-- 1. Colonnes attendues par le client
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime_type text;
alter table public.messages add column if not exists attachment_size_bytes bigint;
alter table public.messages add column if not exists updated_at timestamptz not null default now();
alter table public.messages add column if not exists deleted_at timestamptz;

-- Reponse a un message : la cle etrangere doit etre NOMMEE pour que l'embed
-- `reply_to:messages!messages_reply_to_id_fkey(...)` soit resolvable par PostgREST.
alter table public.messages add column if not exists reply_to_id uuid;
do $$
begin
  alter table public.messages add constraint messages_reply_to_id_fkey
    foreign key (reply_to_id) references public.messages(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.messages add constraint messages_type_check
    check (message_type in ('text', 'image', 'file', 'system'));
exception
  when duplicate_object then null;
end $$;

-- Le message vide est legitime quand il porte une piece jointe, et la suppression
-- logique remplace le corps par une chaine vide : la contrainte 001 (1..10000)
-- faisait echouer ces deux ecritures. Elle est elargie a 0..10000, pas supprimee.
do $$
begin
  alter table public.messages drop constraint messages_body_check;
  alter table public.messages add constraint messages_body_check check (char_length(body) between 0 and 10000);
exception
  when undefined_object then
    alter table public.messages add constraint messages_body_check check (char_length(body) between 0 and 10000);
end $$;

create index if not exists messages_conversation_reply_idx on public.messages(reply_to_id) where reply_to_id is not null;
create index if not exists conversations_updated_idx on public.conversations(updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. Reactions de messages (jamais creees jusqu'ici)
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction_type)
);

alter table public.message_reactions enable row level security;
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'members read message reactions') then
    execute $pol$
      create policy "members read message reactions" on public.message_reactions
        for select using (public.is_conversation_member((select conversation_id from public.messages m where m.id = message_reactions.message_id)))
    $pol$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'users react to member messages') then
    execute $pol$
      create policy "users react to member messages" on public.message_reactions
        for insert with check (user_id = auth.uid() and public.is_conversation_member((select conversation_id from public.messages m where m.id = message_reactions.message_id)))
    $pol$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'users remove own reactions') then
    execute $pol$
      create policy "users remove own reactions" on public.message_reactions
        for delete using (user_id = auth.uid())
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Droits d'ecriture qui manquaient sur les tables deja presentes
-- ---------------------------------------------------------------------------
do $$
begin
  -- Marquer la conversation comme lue ecrit dans conversation_members.last_read_at.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'members update own membership') then
    execute $pol$
      create policy "members update own membership" on public.conversation_members
        for update using (user_id = auth.uid()) with check (user_id = auth.uid())
    $pol$;
  end if;

  -- Rejoindre soi-meme la conversation d'un groupe public, a la condition que
  -- l'adhesion au groupe ait ete acceptee (policy 006) : pas d'invitation libre
  -- vers les conversations privees.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'members join public group chats') then
    execute $pol$
      create policy "members join public group chats" on public.conversation_members
        for insert with check (
          user_id = auth.uid()
          and exists (
            select 1 from public.groups g
            where g.conversation_id = conversation_members.conversation_id
              and g.visibility = 'public'
          )
        )
    $pol$;
  end if;

  -- Editer / supprimer ses propres messages. La suppression est logique dans le
  -- client (corps vide + deleted_at) ; la policy DELETE reste utile aux purges.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'members edit own messages') then
    execute $pol$
      create policy "members edit own messages" on public.messages
        for update using (sender_id = auth.uid()) with check (sender_id = auth.uid())
    $pol$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'members delete own messages') then
    execute $pol$
      create policy "members delete own messages" on public.messages
        for delete using (sender_id = auth.uid())
    $pol$;
  end if;

  -- Comptage des membres d'un groupe public : sans lecture de group_members,
  -- l'embed renvoyait 0 membre a un visiteur, ce qui est faux.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'group_members' and policyname = 'public group rosters readable') then
    execute $pol$
      create policy "public group rosters readable" on public.group_members
        for select using (exists (select 1 from public.groups g where g.id = group_members.group_id and g.visibility = 'public'))
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Activite des conversations (ordre de la liste) et horodatage d'edition
-- ---------------------------------------------------------------------------
create or replace function public.touch_conversation_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set updated_at = new.created_at
   where id = new.conversation_id
     and updated_at < new.created_at;
  return new;
end $$;

create or replace function public.touch_message_on_edit()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

drop trigger if exists messages_touch_updated_at on public.messages;
create trigger messages_touch_updated_at before update on public.messages
  for each row execute function public.touch_message_on_edit();

-- ---------------------------------------------------------------------------
-- 5. Direct (Realtime) : les tables qui ne sont pas encore dans la publication
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
      alter publication supabase_realtime add table public.message_reactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
      alter publication supabase_realtime add table public.conversation_members;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
      alter publication supabase_realtime add table public.conversations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;

-- Controles rapides, a executer separement si besoin :
--
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'messages'
--    and column_name in ('message_type','reply_to_id','attachment_name',
--                        'attachment_mime_type','attachment_size_bytes','updated_at','deleted_at')
--  order by 1;                                              -- attendu : 7 lignes
--
-- select to_regclass('public.message_reactions');             -- attendu : message_reactions
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and tablename in ('messages','conversation_members','message_reactions','group_members')
--  order by 1, 2;
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and schemaname = 'public'
--    and tablename in ('messages','message_reactions','conversation_members','conversations','groups','group_members');
