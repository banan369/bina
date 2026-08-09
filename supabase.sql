-- بينا | مخطط Supabase قابل للتشغيل
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'عضو من بينا',
  city text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('need','offer')),
  title text not null,
  description text not null,
  category text not null,
  city text,
  status text not null default 'active' check (status in ('active','matched','completed','closed')),
  created_at timestamptz not null default now()
);

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

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewed_user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  check (reviewer_id <> reviewed_user_id)
);

-- إنشاء ملف مستخدم آليًا عند التسجيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','عضو من بينا'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- ملفات المستخدمين
create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- المنشورات
create policy "posts public read" on public.posts for select using (status <> 'closed' or auth.uid() = user_id);
create policy "posts own insert" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "posts own update" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts own delete" on public.posts for delete to authenticated using (auth.uid() = user_id);

-- المحادثات: القراءة عبر العضوية
create policy "conversation member read" on public.conversations for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
);
create policy "conversation authenticated insert" on public.conversations for insert to authenticated with check (true);

-- العضوية: المستخدم يرى صفوف عضويته ويضيف نفسه فقط
create policy "membership own read" on public.conversation_members for select to authenticated using (user_id = auth.uid());
create policy "membership self insert" on public.conversation_members for insert to authenticated with check (user_id = auth.uid());

-- الرسائل
create policy "messages member read" on public.messages for select to authenticated using (
  exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
);
create policy "messages member insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
);

-- التقييمات
create policy "reviews public read" on public.reviews for select using (true);
create policy "reviews own insert" on public.reviews for insert to authenticated with check (reviewer_id = auth.uid());
