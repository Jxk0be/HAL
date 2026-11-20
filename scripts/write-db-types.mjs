// Writes Supabase types saved from the MCP generate_typescript_types tool into the web app.
// Usage: node scripts/write-db-types.mjs <saved-output-file>
import fs from 'node:fs'

let j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').trim())
if (Array.isArray(j)) j = JSON.parse(j[0].text)
const t = j.types
fs.writeFileSync('apps/web/src/types/database.ts', t.endsWith('\n') ? t : `${t}\n`)
console.log('wrote apps/web/src/types/database.ts')
