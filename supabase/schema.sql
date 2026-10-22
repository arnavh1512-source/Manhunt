-- SCRAM multiplayer backend (Supabase project "scram").
--
-- Tables have RLS on with no policies, and anon/authenticated have no table
-- privileges, so clients can't read or write them directly. Every read and write
-- goes through the security-definer functions below, which check the player's
-- secret and only return what that player is allowed to see:
--   * your own position and your team's, never the other team's live position;
--   * hunters get runners' positions only as ping snapshots, plus runners who have
--     stayed outside the zone for more than 30 seconds;
--   * tagged players and finished rounds see everyone.
-- Pings and the winner are decided on the server whenever any player polls.

-- ——— Tables ———

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player uuid,
  status text not null default 'lobby' check (status in ('lobby', 'live', 'over')),
  round int not null default 0,
  zone_lat double precision,
  zone_lng double precision,
  zone_m int not null default 840 check (zone_m between 400 and 3000),
  round_min int not null default 45 check (round_min between 10 and 180),
  ping_min int not null default 5 check (ping_min between 1 and 30),
  head_start_min int not null default 3 check (head_start_min between 0 and 15),
  shrink boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  winner text check (winner in ('hunter', 'runner')),
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  secret uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  choice text not null default 'random' check (choice in ('hunter', 'runner', 'random')),
  role text check (role in ('hunter', 'runner')),
  ready boolean not null default false,
  tagged boolean not null default false,
  tagged_at timestamptz,
  lat double precision,
  lng double precision,
  loc_at timestamptz,
  outside_since timestamptz,
  left_at timestamptz,
  joined_at timestamptz not null default now()
);
create index players_game_idx on public.players (game_id);

-- One row per runner per ping; `round` keeps rematches apart without deleting history.
create table public.pings (
  game_id uuid not null references public.games (id) on delete cascade,
  round int not null default 0,
  n int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now(),
  primary key (game_id, round, n, player_id)
);
create index pings_player_idx on public.pings (player_id);

create table public.messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team text not null check (team in ('hunter', 'runner', 'lobby')),
  body text not null check (char_length(body) between 1 and 280),
  at timestamptz not null default now()
);
create index messages_game_idx on public.messages (game_id, id);
create index messages_player_idx on public.messages (player_id);

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.pings enable row level security;
alter table public.messages enable row level security;
revoke all on public.games, public.players, public.pings, public.messages from anon, authenticated;

-- ——— Helpers (not callable by clients) ———

create function public._me(p_player uuid, p_secret uuid)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare r public.players;
begin
  select * into r from players where id = p_player and secret = p_secret and left_at is null;
  if not found then raise exception 'not_in_game' using errcode = 'P0001'; end if;
  return r;
end $$;

create function public._dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = public
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- Zone radius in metres at a moment: shrinks 15% at each quarter of the hunt.
create function public._zone_r(g public.games, at_time timestamptz)
returns double precision
language plpgsql stable set search_path = public
as $$
declare hunt_s double precision; quarter double precision; shrinks int;
begin
  if not g.shrink or g.started_at is null then return g.zone_m / 2.0; end if;
  hunt_s := greatest(0, extract(epoch from at_time - g.started_at) - g.head_start_min * 60);
  quarter := g.round_min * 60 / 4.0;
  shrinks := least(3, floor(hunt_s / quarter));
  return g.zone_m / 2.0 * power(0.85, shrinks);
end $$;

-- Advance a live game: take any due ping and decide the winner.
create function public._tick(p_game uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g public.games;
  hunt_s double precision;
  due int;
  runners_left int;
begin
  select * into g from games where id = p_game for update;
  if g.status <> 'live' then return; end if;
  hunt_s := extract(epoch from now() - g.started_at) - g.head_start_min * 60;

  if hunt_s > 0 then
    due := floor(hunt_s / (g.ping_min * 60));
    if due >= 1 and not exists (select 1 from pings where game_id = g.id and round = g.round and n = due) then
      insert into pings (game_id, round, n, player_id, lat, lng)
      select g.id, g.round, due, p.id, p.lat, p.lng
      from players p
      where p.game_id = g.id and p.role = 'runner' and not p.tagged and p.left_at is null and p.lat is not null
      on conflict do nothing;
    end if;
  end if;

  select count(*) into runners_left from players
  where game_id = g.id and role = 'runner' and not tagged and left_at is null;

  if hunt_s >= 0 and runners_left = 0 then
    update games set status = 'over', winner = 'hunter', ended_at = now() where id = g.id;
  elsif hunt_s >= g.round_min * 60 then
    update games set status = 'over', winner = 'runner', ended_at = now() where id = g.id;
  end if;
end $$;

create function public._code()
returns text
language plpgsql set search_path = public
as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from games where code = c);
  end loop;
  return c;
end $$;

-- ——— Client API ———

create function public.create_game(p_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare g public.games; p public.players;
begin
  insert into games (code) values (_code()) returning * into g;
  insert into players (game_id, name) values (g.id, trim(p_name)) returning * into p;
  update games set host_player = p.id where id = g.id;
  return jsonb_build_object('game_id', g.id, 'code', g.code, 'player_id', p.id, 'secret', p.secret);
end $$;

create function public.join_game(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare g public.games; p public.players;
begin
  select * into g from games where code = upper(trim(p_code)) and status = 'lobby';
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  if (select count(*) from players where game_id = g.id and left_at is null) >= 30 then
    raise exception 'game_full' using errcode = 'P0001';
  end if;
  insert into players (game_id, name) values (g.id, trim(p_name)) returning * into p;
  return jsonb_build_object('game_id', g.id, 'code', g.code, 'player_id', p.id, 'secret', p.secret);
end $$;

create function public.update_settings(p_player uuid, p_secret uuid, p_settings jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players;
begin
  me := _me(p_player, p_secret);
  update games set
    zone_lat = coalesce((p_settings->>'zone_lat')::double precision, zone_lat),
    zone_lng = coalesce((p_settings->>'zone_lng')::double precision, zone_lng),
    zone_m = coalesce((p_settings->>'zone_m')::int, zone_m),
    round_min = coalesce((p_settings->>'round_min')::int, round_min),
    ping_min = coalesce((p_settings->>'ping_min')::int, ping_min),
    head_start_min = coalesce((p_settings->>'head_start_min')::int, head_start_min),
    shrink = coalesce((p_settings->>'shrink')::boolean, shrink)
  where id = me.game_id and host_player = me.id and status = 'lobby';
  if not found then raise exception 'not_host' using errcode = 'P0001'; end if;
end $$;

create function public.set_choice(p_player uuid, p_secret uuid, p_choice text)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players;
begin
  me := _me(p_player, p_secret);
  update players set choice = p_choice, ready = false where id = me.id;
end $$;

create function public.set_ready(p_player uuid, p_secret uuid, p_ready boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players;
begin
  me := _me(p_player, p_secret);
  update players set ready = p_ready where id = me.id;
end $$;

-- Host starts the round. Random fills whichever team is short.
create function public.start_game(p_player uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me public.players;
  g public.games;
  n int; hunters int; runners int; max_h int; target int;
  r record;
begin
  me := _me(p_player, p_secret);
  select * into g from games where id = me.game_id for update;
  if g.host_player <> me.id or g.status <> 'lobby' then raise exception 'not_host' using errcode = 'P0001'; end if;
  if g.zone_lat is null then raise exception 'no_zone' using errcode = 'P0001'; end if;

  select count(*), count(*) filter (where choice = 'hunter'), count(*) filter (where choice = 'runner')
    into n, hunters, runners from players where game_id = g.id and left_at is null;
  max_h := greatest(1, n / 2);
  if n < 3 then raise exception 'need_3_players' using errcode = 'P0001'; end if;
  if hunters > max_h then raise exception 'too_many_hunters' using errcode = 'P0001'; end if;
  if n - runners < 1 then raise exception 'need_a_hunter' using errcode = 'P0001'; end if;
  if exists (select 1 from players where game_id = g.id and left_at is null and not ready) then
    raise exception 'not_all_ready' using errcode = 'P0001';
  end if;

  target := least(max_h, greatest(1, round(n / 3.0)::int));
  update players set role = choice, tagged = false, tagged_at = null, outside_since = null
    where game_id = g.id and left_at is null and choice <> 'random';
  for r in select id from players where game_id = g.id and left_at is null and choice = 'random' order by random() loop
    if hunters < target then
      update players set role = 'hunter', tagged = false, tagged_at = null, outside_since = null where id = r.id;
      hunters := hunters + 1;
    else
      update players set role = 'runner', tagged = false, tagged_at = null, outside_since = null where id = r.id;
    end if;
  end loop;
  if not exists (select 1 from players where game_id = g.id and left_at is null and role = 'runner') then
    raise exception 'need_a_runner' using errcode = 'P0001';
  end if;

  update games set status = 'live', round = round + 1, started_at = now(), winner = null, ended_at = null where id = g.id;
end $$;

-- Each phone reports its own position.
create function public.update_location(p_player uuid, p_secret uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players; g public.games; outside boolean;
begin
  me := _me(p_player, p_secret);
  select * into g from games where id = me.game_id;
  if g.status = 'over' or me.tagged then return; end if;
  outside := g.zone_lat is not null and _dist_m(g.zone_lat, g.zone_lng, p_lat, p_lng) > _zone_r(g, now());
  update players set
    lat = p_lat, lng = p_lng, loc_at = now(),
    outside_since = case when outside and g.status = 'live' then coalesce(outside_since, now()) end
  where id = me.id;
end $$;

-- The runner confirms a hunter tagged them in person.
create function public.confirm_tag(p_player uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players;
begin
  me := _me(p_player, p_secret);
  if me.role is distinct from 'runner' then return; end if;
  update players set tagged = true, tagged_at = now(), outside_since = null where id = me.id;
  perform _tick(me.game_id);
end $$;

create function public.send_message(p_player uuid, p_secret uuid, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players; g public.games;
begin
  me := _me(p_player, p_secret);
  select * into g from games where id = me.game_id;
  insert into messages (game_id, player_id, team, body)
  values (me.game_id, me.id, case when g.status = 'lobby' or me.role is null then 'lobby' else me.role end, left(trim(p_body), 280));
end $$;

create function public.leave_game(p_player uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players; g public.games; next_host uuid;
begin
  me := _me(p_player, p_secret);
  update players set left_at = now(), ready = false where id = me.id;
  select * into g from games where id = me.game_id;
  if g.host_player = me.id then
    select id into next_host from players where game_id = g.id and left_at is null order by joined_at limit 1;
    update games set host_player = next_host where id = g.id;
  end if;
  perform _tick(me.game_id);
end $$;

-- Host sends everyone back to the lobby for another round.
create function public.rematch(p_player uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me public.players;
begin
  me := _me(p_player, p_secret);
  update games set status = 'lobby', started_at = null, ended_at = null, winner = null
    where id = me.game_id and host_player = me.id and status = 'over';
  if not found then raise exception 'not_host' using errcode = 'P0001'; end if;
  update players set ready = false, role = null, tagged = false, tagged_at = null, outside_since = null
    where game_id = me.game_id;
end $$;

-- Everything this player is allowed to see right now.
create function public.get_state(p_player uuid, p_secret uuid, p_after_message bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me public.players;
  g public.games;
  see_all boolean;
  last_n int;
begin
  me := _me(p_player, p_secret);
  perform _tick(me.game_id);
  select * into me from players where id = me.id;
  select * into g from games where id = me.game_id;
  see_all := g.status = 'over' or me.tagged;
  select coalesce(max(n), 0) into last_n from pings where game_id = g.id and round = g.round;

  return jsonb_build_object(
    'now', now(),
    'me', me.id,
    'game', jsonb_build_object(
      'id', g.id, 'code', g.code, 'status', g.status, 'host_player', g.host_player, 'round', g.round,
      'zone_lat', g.zone_lat, 'zone_lng', g.zone_lng, 'zone_m', g.zone_m,
      'round_min', g.round_min, 'ping_min', g.ping_min, 'head_start_min', g.head_start_min,
      'shrink', g.shrink, 'started_at', g.started_at, 'ended_at', g.ended_at, 'winner', g.winner
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'choice', p.choice, 'role', p.role, 'ready', p.ready, 'tagged', p.tagged,
        'lat', case when p.id = me.id or see_all or (p.role is not null and p.role = me.role)
                    or (me.role = 'hunter' and p.outside_since < now() - interval '30 seconds') then p.lat end,
        'lng', case when p.id = me.id or see_all or (p.role is not null and p.role = me.role)
                    or (me.role = 'hunter' and p.outside_since < now() - interval '30 seconds') then p.lng end,
        'live_outside', coalesce(me.role = 'hunter' and p.role = 'runner' and p.outside_since < now() - interval '30 seconds', false)
      ) order by p.joined_at)
      from players p where p.game_id = g.id and p.left_at is null
    ), '[]'::jsonb),
    'last_ping', last_n,
    'pings', case when me.role = 'hunter' or see_all then coalesce((
      select jsonb_agg(jsonb_build_object('player_id', k.player_id, 'lat', k.lat, 'lng', k.lng, 'at', k.at))
      from pings k where k.game_id = g.id and k.round = g.round and k.n = last_n
    ), '[]'::jsonb) else '[]'::jsonb end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'from', p.name, 'player_id', m.player_id, 'body', m.body, 'at', m.at) order by m.id)
      from messages m join players p on p.id = m.player_id
      where m.game_id = g.id and m.id > p_after_message
        and m.team = case when g.status = 'lobby' or me.role is null then 'lobby' else me.role end
    ), '[]'::jsonb)
  );
end $$;

-- ——— Permissions: only the client API is callable from the app ———

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_game(text),
  public.join_game(text, text),
  public.update_settings(uuid, uuid, jsonb),
  public.set_choice(uuid, uuid, text),
  public.set_ready(uuid, uuid, boolean),
  public.start_game(uuid, uuid),
  public.update_location(uuid, uuid, double precision, double precision),
  public.confirm_tag(uuid, uuid),
  public.send_message(uuid, uuid, text),
  public.leave_game(uuid, uuid),
  public.rematch(uuid, uuid),
  public.get_state(uuid, uuid, bigint)
to anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
