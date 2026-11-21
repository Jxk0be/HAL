/**
 * /report match:<autocomplete> shot1..shot5:<attachments> → a modal with one line per map
 * ("Mode | Map | home-away") → a report_drafts row with the maps and the screenshots, and a link to
 * the site form (/report/<match>?prefill=<draft>) where the captain adds the player stats and
 * submits. Nothing is compared or counted until that site submit.
 */
import { ephemeral, type DiscordAttachment, type Handler } from '../_shared/interactions.ts'
import { halEmbed, noticeEmbed } from '../_shared/embeds.ts'
import { adminClient } from '../_shared/supabase.ts'
import { parseReportLines, seriesOf } from '../_shared/report_parse.ts'
import { formatLeague } from '../_shared/time.ts'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

interface Reportable {
  match_id: string
  week: number
  scheduled_at: string
  team_id: string
  home_tag: string
  away_tag: string
  opponent_tag: string
}

async function reportable(profileId: string): Promise<Reportable[]> {
  const { data } = await adminClient().rpc('reportable_matches_for', { p_actor: profileId })
  return (data ?? []) as Reportable[]
}

export const reportAutocomplete: Handler = {
  async run({ interaction, profile }) {
    if (!profile) return { kind: 'autocomplete', choices: [] }
    const q = String(interaction.data?.options?.find((o) => o.focused)?.value ?? '').toLowerCase()
    const list = await reportable(profile.id)
    return {
      kind: 'autocomplete',
      choices: list
        .map((m) => ({ name: `Week ${m.week} vs ${m.opponent_tag} · ${formatLeague(m.scheduled_at)}`.slice(0, 100), value: m.match_id }))
        .filter((c) => !q || c.name.toLowerCase().includes(q)),
    }
  },
}

function modal(match: Reportable, prefill: string[]) {
  const scoreOrder = `${match.home_tag}-${match.away_tag}`
  return {
    custom_id: `report:submit:${match.match_id}`,
    title: `Report ${match.home_tag} vs ${match.away_tag}`.slice(0, 45),
    components: [1, 2, 3, 4, 5].map((n) => ({
      type: 1,
      components: [
        {
          type: 4,
          custom_id: `map${n}`,
          label: `Map ${n}: mode | map | ${scoreOrder} score`.slice(0, 45),
          style: 1,
          required: n <= 3,
          max_length: 100,
          placeholder: n === 1 ? 'Hardpoint | Vista | 250-187' : n <= 3 ? 'Mode | Map | home-away' : 'Only if the series went this far',
          ...(prefill[n - 1] ? { value: prefill[n - 1] } : {}),
        },
      ],
    })),
  }
}

export const reportCommand: Handler = {
  async run({ interaction, user, profile }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    const options = interaction.data?.options ?? []
    const matchId = String(options.find((o) => o.name === 'match')?.value ?? '')
    const match = (await reportable(profile.id)).find((m) => m.match_id === matchId)
    if (!match) {
      return ephemeral('Pick one of your matches from the list. You can report once the match has started, as captain or co-captain, until it is confirmed.', 'error')
    }

    // Screenshots arrive with the command; keep them until the modal comes back.
    const resolved = interaction.data?.resolved?.attachments ?? {}
    const shots = options
      .filter((o) => /^shot[1-5]$/.test(o.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => resolved[String(o.value)])
      .filter((a): a is DiscordAttachment => Boolean(a))
    const bad = shots.find((a) => !IMAGE_TYPES.includes(a.content_type ?? '') || a.size > MAX_BYTES)
    if (bad) return ephemeral(`"${bad.filename}" must be a PNG, JPEG or WebP image under 8 MB.`, 'error')
    if (!shots.length) return ephemeral('Attach at least one scoreboard screenshot (shot1).', 'error')

    const db = adminClient()
    await db.from('pending_discord_reports').upsert({
      discord_user_id: user.id,
      match_id: matchId,
      attachments: shots.map((a) => ({ url: a.url, filename: a.filename, content_type: a.content_type, size: a.size })),
      created_at: new Date().toISOString(),
    })

    // Prefill from an earlier Discord draft for this match, if any.
    const { data: draft } = await db.from('report_drafts').select('maps').eq('match_id', matchId).eq('team_id', match.team_id).maybeSingle()
    let prefill: string[] = []
    if (draft && Array.isArray(draft.maps) && draft.maps.length) {
      const [{ data: modes }, { data: maps }] = await Promise.all([db.from('game_modes').select('id, name'), db.from('maps').select('id, name')])
      const nameOf = (list: { id: string; name: string }[] | null, id: string) => list?.find((x) => x.id === id)?.name ?? ''
      // deno-lint-ignore no-explicit-any
      prefill = (draft.maps as any[]).map((m) => `${nameOf(modes, m.mode_id)} | ${nameOf(maps, m.map_id)} | ${m.home_score}-${m.away_score}`)
    }
    return { kind: 'modal', data: modal(match, prefill) }
  },
}

export const reportModal: Handler = {
  run({ interaction, user, profile, deps, id }) {
    const matchId = id ?? ''
    // deno-lint-ignore no-explicit-any
    const rows = (interaction.data?.components ?? []) as any[]
    const values: Record<string, string> = {}
    for (const row of rows) for (const c of row.components ?? []) values[c.custom_id] = c.value ?? ''
    const lines = [1, 2, 3, 4, 5].map((n) => values[`map${n}`] ?? '')

    return {
      kind: 'deferred',
      ephemeral: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        const db = adminClient()
        const match = (await reportable(profile.id)).find((m) => m.match_id === matchId)
        if (!match) return { embeds: [noticeEmbed('This match can no longer be reported from Discord (it may be confirmed or disputed).', 'error')] }

        const { data: pending } = await db.from('pending_discord_reports').select('attachments').eq('discord_user_id', user.id).eq('match_id', matchId).maybeSingle()
        if (!pending) return { embeds: [noticeEmbed('Your screenshots expired. Run /report again with the screenshots attached.', 'error')] }

        const [{ data: modes }, { data: maps }, { data: legal }] = await Promise.all([
          db.from('game_modes').select('id, name').eq('active', true),
          db.from('maps').select('id, name').eq('active', true),
          db.from('map_modes').select('map_id, mode_id'),
        ])
        const parsed = parseReportLines(lines, {
          modes: modes ?? [],
          maps: maps ?? [],
          legal: new Set((legal ?? []).map((x) => `${x.map_id}:${x.mode_id}`)),
        })
        if (!parsed.ok) {
          return {
            embeds: [
              noticeEmbed(
                [
                  `Nothing was saved. Fix these and run **/report** again:\n• ${parsed.errors.join('\n• ')}`,
                  '',
                  'What you entered (copy and fix):',
                  '```',
                  ...lines.filter((l, i) => l.trim() || i < 3).map((l, i) => `${i + 1}. ${l.trim() || '(empty)'}`),
                  '```',
                ].join('\n').slice(0, 4000),
                'error',
              ),
            ],
          }
        }

        // Copy the screenshots into storage (same path scheme as the site): shot k → map k.
        // deno-lint-ignore no-explicit-any
        const shots = (pending.attachments ?? []) as any[]
        const paths: string[] = []
        const stamp = Date.now().toString(36)
        for (const [i, shot] of shots.entries()) {
          const mapNumber = Math.min(i + 1, parsed.maps.length)
          try {
            const res = await fetch(shot.url)
            if (!res.ok) throw new Error(`download ${res.status}`)
            const type = shot.content_type ?? res.headers.get('content-type') ?? 'image/png'
            const path = `matches/${matchId}/${match.team_id}/map${mapNumber}-d${stamp}${i}.${EXT[type] ?? 'png'}`
            const { error } = await db.storage.from('screenshots').upload(path, await res.arrayBuffer(), { contentType: type, upsert: true })
            if (error) throw error
            paths.push(path)
          } catch (err) {
            console.error('screenshot copy failed', err)
          }
        }

        const { data: draft, error } = await db
          .from('report_drafts')
          .upsert(
            {
              match_id: matchId,
              team_id: match.team_id,
              created_by: profile.id,
              maps: parsed.maps.map(({ number, mode_id, map_id, home_score, away_score }) => ({ number, mode_id, map_id, home_score, away_score })),
              screenshot_paths: paths,
              source: 'discord',
            },
            { onConflict: 'match_id,team_id' },
          )
          .select('id')
          .single()
        if (error || !draft) return { embeds: [noticeEmbed('Could not save the report. Please try again.', 'error')] }
        await db.from('pending_discord_reports').delete().eq('discord_user_id', user.id).eq('match_id', matchId)

        const s = seriesOf(parsed.maps)
        const covered = new Set(paths.map((p) => Number(/\/map(\d+)-/.exec(p)?.[1])))
        const missing = parsed.maps.filter((m) => !covered.has(m.number)).map((m) => m.number)
        const link = `${deps.siteUrl}/report/${matchId}?prefill=${draft.id}`
        return {
          embeds: [
            halEmbed({
              title: `${match.home_tag} ${s.home} – ${s.away} ${match.away_tag}: maps saved`,
              description: [
                ...parsed.maps.map((m) => `Map ${m.number} · ${m.modeName} · ${m.mapName}: **${m.home_score}-${m.away_score}**`),
                '',
                `${paths.length} screenshot${paths.length === 1 ? '' : 's'} saved.${missing.length ? ` Add one for map ${missing.join(', ')} on the site.` : ''}`,
                '**Not submitted yet.** Enter the player stats on the site to finish your report.',
              ].join('\n'),
            }),
          ],
          components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Enter player stats', url: link }] }],
        }
      },
    }
  },
}
