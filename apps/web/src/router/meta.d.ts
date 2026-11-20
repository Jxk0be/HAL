import 'vue-router'

export {}

declare module 'vue-router' {
  interface RouteMeta {
    /** Page title (document title and placeholder heading). */
    title?: string
    /** Small caps label above the placeholder heading. */
    eyebrow?: string
    /** One-line description for placeholder pages. */
    description?: string
    /** Which guide step builds this page (placeholder pages show it). */
    buildStep?: number
    requiresAuth?: boolean
    /** Player/captain feature: needs a finished profile and no active ban. */
    player?: boolean
    /** Staff access: any staff role, owner/admin, or owner only. */
    staff?: 'any' | 'admin' | 'owner'
  }
}
