import { ephemeral, type Registry } from '../_shared/interactions.ts'
import { halEmbed } from '../_shared/embeds.ts'

/**
 * Command, component, modal and autocomplete handlers. Later steps register more here:
 * commands by name, components/modals by the "feature" part of custom_id ("feature:action:id").
 */
export const registry: Registry = {
  commands: {
    ping: {
      public: true,
      run: () => ephemeral('HAL bot online.', 'success'),
    },
    link: {
      public: true,
      async run({ user, deps }) {
        const profile = await deps.getProfileByDiscordId(user.id)
        if (!profile) {
          return ephemeral(
            `You're not on HAL yet. [Log in with Discord](${deps.siteUrl}/login) to create your player profile.`,
          )
        }
        return {
          kind: 'message',
          ephemeral: true,
          payload: {
            embeds: [
              halEmbed({
                title: profile.activisionId ?? profile.discordUsername ?? 'Your HAL profile',
                url: `${deps.siteUrl}/players/${profile.id}`,
                description: `[Public profile](${deps.siteUrl}/players/${profile.id}) · [Edit my profile](${deps.siteUrl}/profile)`,
              }),
            ],
          },
        }
      },
    },
  },
  components: {},
  modals: {},
  autocomplete: {},
}
