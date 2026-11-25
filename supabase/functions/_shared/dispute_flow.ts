/**
 * Private dispute threads in #disputes, shared by /dispute (discord-interactions) and the
 * scheduler (disputes opened, commented on or resolved on the site). Idempotent: a dispute gets
 * one thread, recorded in disputes.discord_thread_id.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addThreadMember, createPrivateThread, sendMessage, updateThread } from './discord.ts'
import { claimEvent, recordEvent, releaseEvent } from './match_data.ts'
import {
  disputeCommentMessage,
  disputeOpeningMessage,
  disputeReopenedMessage,
  disputeResolvedMessage,
  disputeThreadName,
  recusedNote,
} from './dispute_messages.ts'

const REASON = 'BIL dispute'

interface DisputeRow {
  id: string
  matchId: string
  teamId: string
  category: string
  reason: string
  status: string
  resolution: string | null
  threadId: string | null
  week: number
  home: { id: string; name: string; tag: string }
  away: { id: string; name: string; tag: string }
}

async function loadDispute(db: SupabaseClient, disputeId: string): Promise<DisputeRow | null> {
  const { data } = await db
    .from('disputes')
    .select('id, match_id, team_id, category, reason, status, resolution, discord_thread_id, match:matches(week, home:teams!matches_home_team_id_fkey(id, name, tag), away:teams!matches_away_team_id_fkey(id, name, tag))')
    .eq('id', disputeId)
    .maybeSingle()
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const m = (data as any).match
  return {
    id: data.id,
    matchId: data.match_id,
    teamId: data.team_id,
    category: data.category,
    reason: data.reason,
    status: data.status,
    resolution: data.resolution,
    threadId: data.discord_thread_id,
    week: m.week,
    home: m.home,
    away: m.away,
  }
}

/** Creates the dispute's private thread (once), adds the right people and posts the opening embed. */
export async function ensureDisputeThread(db: SupabaseClient, disputeId: string, channelId: string, siteUrl: string): Promise<string | null> {
  const d = await loadDispute(db, disputeId)
  if (!d) return null
  if (d.threadId) return d.threadId
  // Claim first so the command and the scheduler can't both create a thread.
  const claim = await claimEvent(db, d.matchId, null, `dispute:${d.id}`)
  if (claim === null) return null

  let thread: { id: string }
  try {
    thread = await createPrivateThread(channelId, disputeThreadName(d.id, d.home.tag, d.away.tag), REASON)
  } catch (err) {
    await releaseEvent(db, claim)
    throw err
  }
  await db.from('disputes').update({ discord_thread_id: thread.id }).eq('id', d.id)
  await recordEvent(db, claim, channelId, thread.id)

  const { data: people } = await db.rpc('dispute_thread_people', { p_dispute_id: d.id })
  const p = (people ?? { captains: [], admins: [], recused: 0 }) as { captains: string[]; admins: string[]; recused: number }
  for (const id of [...p.captains, ...p.admins]) {
    // Someone not in the server can't be added; the rest still are.
    await addThreadMember(thread.id, id).catch((err) => console.error('add thread member failed', id, err))
  }

  const { data: evidence } = await db.from('dispute_evidence').select('url, storage_path, note').eq('dispute_id', d.id)
  await sendMessage(
    thread.id,
    disputeOpeningMessage(
      {
        disputeId: d.id,
        matchId: d.matchId,
        week: d.week,
        homeName: d.home.name,
        awayName: d.away.name,
        openedByTeam: d.teamId === d.home.id ? d.home.name : d.away.name,
        category: d.category,
        reason: d.reason,
        evidence: (evidence ?? []).map((e) => ({ url: e.url, note: e.note, image: Boolean(e.storage_path) })),
        captainIds: p.captains,
        adminIds: p.admins,
      },
      siteUrl,
    ),
  )
  const note = recusedNote(p.recused)
  if (note) await sendMessage(thread.id, note)
  return thread.id
}

/** Posts the decision in the thread, then archives and locks it. */
export async function closeDisputeThread(db: SupabaseClient, disputeId: string, siteUrl: string) {
  const d = await loadDispute(db, disputeId)
  if (!d?.threadId || d.status !== 'resolved') return
  await sendMessage(d.threadId, disputeResolvedMessage(d.resolution, siteUrl, d.matchId))
  await updateThread(d.threadId, { archived: true, locked: true }, REASON)
}

export async function reopenDisputeThread(db: SupabaseClient, disputeId: string) {
  const d = await loadDispute(db, disputeId)
  if (!d?.threadId) return
  await updateThread(d.threadId, { archived: false, locked: false }, REASON)
  await sendMessage(d.threadId, disputeReopenedMessage())
}

/** Mirrors a comment written on the site into the thread. */
export async function postDisputeComment(db: SupabaseClient, disputeId: string, commentId: string) {
  const d = await loadDispute(db, disputeId)
  if (!d?.threadId || d.status !== 'open') return
  const { data: c } = await db.from('dispute_comments').select('body, author_id, author:profiles(discord_username, activision_id)').eq('id', commentId).maybeSingle()
  if (!c) return
  const { data: staff } = await db.from('staff_roles').select('role').eq('user_id', c.author_id).in('role', ['owner', 'admin'])
  // deno-lint-ignore no-explicit-any
  const a = (c as any).author
  await sendMessage(d.threadId, disputeCommentMessage(a?.discord_username ?? a?.activision_id ?? 'Someone', Boolean(staff?.length), c.body))
}
