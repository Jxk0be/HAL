/**
 * /dispute match:<autocomplete> reason:<choice> evidence:<optional attachment> → a modal for the
 * description → open_dispute_as (the same core the site uses) → a private thread in #disputes.
 */
import { ephemeral, type DiscordAttachment, type Handler } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadChannels } from '../_shared/match_data.ts'
import { CATEGORY_LABEL } from '../_shared/dispute_messages.ts'
import { ensureDisputeThread } from '../_shared/dispute_flow.ts'
import { formatLeague } from '../_shared/time.ts'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

interface Disputable {
  match_id: string
  week: number
  scheduled_at: string
  team_id: string
  opponent_tag: string
}

async function disputable(profileId: string): Promise<Disputable[]> {
  const { data } = await adminClient().rpc('disputable_matches_for', { p_actor: profileId })
  return (data ?? []) as Disputable[]
}

const readable = (error: { code?: string; message: string }, fallback: string) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : fallback

export const disputeAutocomplete: Handler = {
  async run({ interaction, profile }) {
    if (!profile) return { kind: 'autocomplete', choices: [] }
    const q = String(interaction.data?.options?.find((o) => o.focused)?.value ?? '').toLowerCase()
    return {
      kind: 'autocomplete',
      choices: (await disputable(profile.id))
        .map((m) => ({ name: `Week ${m.week} vs ${m.opponent_tag} · ${formatLeague(m.scheduled_at)}`.slice(0, 100), value: m.match_id }))
        .filter((c) => !q || c.name.toLowerCase().includes(q)),
    }
  },
}

export const disputeCommand: Handler = {
  async run({ interaction, user, profile }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    const options = interaction.data?.options ?? []
    const matchId = String(options.find((o) => o.name === 'match')?.value ?? '')
    const category = String(options.find((o) => o.name === 'reason')?.value ?? '')
    if (!(category in CATEGORY_LABEL)) return ephemeral('Pick a reason from the list.', 'error')
    const match = (await disputable(profile.id)).find((m) => m.match_id === matchId)
    if (!match) {
      return ephemeral('Pick one of your matches from the list. Disputes open at the match time and close 24 hours after the match (or after the result is confirmed).', 'error')
    }

    const attachmentId = options.find((o) => o.name === 'evidence')?.value
    const file: DiscordAttachment | undefined = attachmentId ? interaction.data?.resolved?.attachments?.[String(attachmentId)] : undefined
    if (file && (!IMAGE_TYPES.includes(file.content_type ?? '') || file.size > 8 * 1024 * 1024)) {
      return ephemeral(`"${file.filename}" must be a PNG, JPEG or WebP image under 8 MB. For video, paste a link in the description.`, 'error')
    }
    await adminClient().from('pending_discord_disputes').upsert({
      discord_user_id: user.id,
      match_id: matchId,
      attachment: file ? { url: file.url, filename: file.filename, content_type: file.content_type } : null,
      created_at: new Date().toISOString(),
    })

    return {
      kind: 'modal',
      data: {
        custom_id: `dispute:submit:${matchId}:${category}`,
        title: `${CATEGORY_LABEL[category]} dispute vs ${match.opponent_tag}`.slice(0, 45),
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'description',
                label: 'What happened? (shown publicly)',
                style: 2,
                required: true,
                min_length: 10,
                max_length: 2000,
                placeholder: 'Map, time, players involved. Paste clip links here too.',
              },
            ],
          },
        ],
      },
    }
  },
}

export const disputeModal: Handler = {
  run({ interaction, user, profile, deps, id }) {
    const [matchId = '', category = 'other'] = (id ?? '').split(':')
    // deno-lint-ignore no-explicit-any
    const description = String((interaction.data?.components as any[])?.[0]?.components?.[0]?.value ?? '')
    return {
      kind: 'deferred',
      ephemeral: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        const db = adminClient()
        const match = (await disputable(profile.id)).find((m) => m.match_id === matchId)
        if (!match) return { embeds: [noticeEmbed('This match can no longer be disputed (the window closed or a dispute is already open).', 'error')] }

        // Evidence: copy the attachment into the private bucket; pull https links out of the text.
        const evidence: { path?: string; url?: string; note?: string }[] = []
        const { data: pending } = await db.from('pending_discord_disputes').select('attachment').eq('discord_user_id', user.id).eq('match_id', matchId).maybeSingle()
        const file = pending?.attachment as { url: string; filename: string; content_type?: string } | null
        if (file) {
          try {
            const res = await fetch(file.url)
            if (!res.ok) throw new Error(`download ${res.status}`)
            const type = file.content_type ?? 'image/png'
            const path = `disputes/${matchId}/${match.team_id}/d${Date.now().toString(36)}.${EXT[type] ?? 'png'}`
            const { error } = await db.storage.from('screenshots').upload(path, await res.arrayBuffer(), { contentType: type })
            if (error) throw error
            evidence.push({ path, note: file.filename.slice(0, 80) })
          } catch (err) {
            console.error('evidence copy failed', err)
          }
        }
        for (const url of (description.match(/https:\/\/\S+/g) ?? []).slice(0, 5)) evidence.push({ url, note: 'Link from the description' })

        const { data: disputeId, error } = await db.rpc('open_dispute_as', {
          p_actor: profile.id,
          p_match_id: matchId,
          p_category: category,
          p_description: description,
          p_evidence: evidence,
        })
        if (error) return { embeds: [noticeEmbed(readable(error, 'Could not open the dispute.'), 'error')] }
        await db.from('pending_discord_disputes').delete().eq('discord_user_id', user.id).eq('match_id', matchId)

        const channels = await loadChannels(db)
        let threadId: string | null = null
        if (channels.disputes) {
          try {
            threadId = await ensureDisputeThread(db, String(disputeId), channels.disputes, deps.siteUrl)
          } catch (err) {
            console.error('dispute thread failed', err)
          }
        }
        const thread = threadId && interaction.guild_id ? ` Discuss it in the private thread: https://discord.com/channels/${interaction.guild_id}/${threadId}` : ''
        return {
          embeds: [
            noticeEmbed(
              `Dispute opened. The match is under review and the result is on hold until an admin decides.${thread}${file && !evidence.some((e) => e.path) ? '\nThe screenshot could not be saved; add it on the match page.' : ''}`,
              'success',
            ),
          ],
        }
      },
    }
  },
}
