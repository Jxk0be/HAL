# scripts

One-off Node/TypeScript scripts, run from the repo root with the root `.env` loaded:

```
pnpm --filter scripts exec tsx --env-file=../.env <script>.ts
```

Planned: `register-commands.ts` (Discord slash command registration).
