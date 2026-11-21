-- One-time setup per environment: lets Postgres triggers call the discord-sync Edge Function.
-- Run in the SQL editor after deploying discord-sync. Safe to re-run: it only creates what's missing.
-- The shared secret is generated inside the database and never leaves it in plain text; the
-- function reads it with public.discord_sync_secret().
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'discord_sync_url') then
    perform vault.create_secret(
      'https://lluwzpwiybvgnsimpwey.supabase.co/functions/v1/discord-sync',  -- change per project
      'discord_sync_url',
      'discord-sync Edge Function URL (called by pg_net triggers)'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'discord_sync_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'discord_sync_secret',
      'Shared secret between pg_net triggers and discord-sync'
    );
  end if;
end;
$$;
