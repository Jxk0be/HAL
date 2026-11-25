# scripts

One-off Node/TypeScript scripts, run from the repo root with the root `.env` loaded.

- `pnpm commands:register` registers the bot's slash commands in the BIL server
  (`register-commands.ts`, definitions in `supabase/functions/_shared/commands.ts`).
