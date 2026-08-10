-- بينا | migration آمن وموحّد للوحة المستخدم
-- شغّل الملف كاملًا في Supabase SQL Editor. الأوامر قابلة لإعادة التشغيل.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'عضو من بينا',
  city text,
  bio text,
  skills text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists skills text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('need','offer')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 2000),
  category text not null,
  city text,
  status text not null default 'active' check (status in ('active','matched','completed','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.posts add column if not exists updated_at timestamptz not null default now();
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists posts_public_feed_idx on public.posts(post_type,status,created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id,user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewed_user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  check (reviewer_id <> reviewed_user_id)
);
create index if not exists reviews_reviewed_user_idx on public.reviews(reviewed_user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts for each row execute function public.set_updated_at();

-- إنشاء الملف آليًا، مع معالجة الحسابات الموجودة قبل إضافة الـ trigger.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'عضو من بينا'))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles (id, full_name, created_at)
select id, coalesce(nullif(trim(raw_user_meta_data->>'full_name'),''),'عضو من بينا'), created_at from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- حذف السياسات القديمة والمعروفة قبل إعادة إنشائها.
drop policy if exists "profiles public read" on public.profiles;
drop policy if exists "profiles own insert" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "posts public read" on public.posts;
drop policy if exists "posts own insert" on public.posts;
drop policy if exists "posts own update" on public.posts;
drop policy if exists "posts own delete" on public.posts;
create policy "posts public read" on public.posts for select using (status <> 'closed' or auth.uid() = user_id);
create policy "posts own insert" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "posts own update" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts own delete" on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "conversation member read" on public.conversations;
drop policy if exists "conversation authenticated insert" on public.conversations;
create policy "conversation member read" on public.conversations for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
);
drop policy if exists "membership own read" on public.conversation_members;
drop policy if exists "membership self insert" on public.conversation_members;
create policy "membership own read" on public.conversation_members for select to authenticated using (user_id = auth.uid());

drop policy if exists "messages member read" on public.messages;
drop policy if exists "messages member insert" on public.messages;
create policy "messages member read" on public.messages for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
);
create policy "messages member insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
);

drop policy if exists "reviews public read" on public.reviews;
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews public read" on public.reviews for select using (true);
create policy "reviews own insert" on public.reviews for insert to authenticated with check (reviewer_id = auth.uid());

-- بدء محادثة مع صاحب منشور؛ الدالة وحدها تضيف الطرفين، فلا يستطيع العميل إضافة أعضاء عشوائيين.
create or replace function public.start_conversation(target_post_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare viewer uuid := auth.uid(); owner_id uuid; conversation_id uuid;
begin
  if viewer is null then raise exception 'Authentication required'; end if;
  select user_id into owner_id from public.posts where id = target_post_id and status <> 'closed';
  if owner_id is null then raise exception 'Post not found'; end if;
  if owner_id = viewer then raise exception 'Cannot message yourself'; end if;
  select c.id into conversation_id from public.conversations c
    where c.post_id = target_post_id
      and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=viewer)
      and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=owner_id)
    limit 1;
  if conversation_id is null then
    insert into public.conversations(post_id) values(target_post_id) returning id into conversation_id;
    insert into public.conversation_members(conversation_id,user_id) values(conversation_id,viewer),(conversation_id,owner_id);
  end if;
  return conversation_id;
end; $$;
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;

-- قائمة محادثات المستخدم مع الاسم الحقيقي للطرف الآخر.
create or replace function public.get_my_conversations()
returns table(conversation_id uuid, post_id uuid, post_title text, other_user_id uuid, other_user_name text, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select c.id, c.post_id, p.title, other.user_id, coalesce(pr.full_name,'عضو من بينا'), c.created_at
  from public.conversations c
  join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
  join public.conversation_members other on other.conversation_id=c.id and other.user_id<>auth.uid()
  left join public.posts p on p.id=c.post_id
  left join public.profiles pr on pr.id=other.user_id
  order by c.created_at desc;
$$;
revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;
