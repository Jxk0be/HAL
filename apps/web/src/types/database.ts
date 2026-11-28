export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcement_posts: {
        Row: {
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          key: string
          occurrence: string
          posted_at: string
          posted_by: string | null
          season_id: string
        }
        Insert: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          key: string
          occurrence: string
          posted_at?: string
          posted_by?: string | null
          season_id: string
        }
        Update: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          key?: string
          occurrence?: string
          posted_at?: string
          posted_by?: string | null
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_posts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_posts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_posts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_posts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_settings: {
        Row: {
          auto: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_events: {
        Row: {
          discord_channel_id: string | null
          discord_message_id: string | null
          id: number
          kind: string
          match_id: string | null
          sent_at: string
          team_id: string | null
        }
        Insert: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: never
          kind: string
          match_id?: string | null
          sent_at?: string
          team_id?: string | null
        }
        Update: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: never
          kind?: string
          match_id?: string | null
          sent_at?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "bot_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          captain_id: string
          checked_in_at: string
          created_at: string
          id: string
          match_id: string
          player_ids: string[]
          source: Database["public"]["Enums"]["submission_source"]
          team_id: string
          updated_at: string
        }
        Insert: {
          captain_id: string
          checked_in_at?: string
          created_at?: string
          id?: string
          match_id: string
          player_ids: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          team_id: string
          updated_at?: string
        }
        Update: {
          captain_id?: string
          checked_in_at?: string
          created_at?: string
          id?: string
          match_id?: string
          player_ids?: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "checkins_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          created_at: string
          id: number
          message: string
          release: string | null
          session_id: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          message: string
          release?: string | null
          session_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          message?: string
          release?: string | null
          session_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_boards: {
        Row: {
          channel_id: string
          content_hash: string
          keep: boolean
          key: string
          message_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          content_hash: string
          keep?: boolean
          key: string
          message_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          content_hash?: string
          keep?: boolean
          key?: string
          message_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      discord_presence: {
        Row: {
          checked_at: string
          in_server: boolean
          user_id: string
        }
        Insert: {
          checked_at?: string
          in_server: boolean
          user_id: string
        }
        Update: {
          checked_at?: string
          in_server?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_sync_errors: {
        Row: {
          action: string
          created_at: string
          error: string
          id: number
          payload: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          error: string
          id?: never
          payload?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          error?: string
          id?: never
          payload?: Json | null
        }
        Relationships: []
      }
      dispute_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dispute_id: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dispute_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dispute_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_comments_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_comments_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          added_by: string
          created_at: string
          dispute_id: string
          id: string
          note: string | null
          storage_path: string | null
          url: string | null
        }
        Insert: {
          added_by: string
          created_at?: string
          dispute_id: string
          id?: string
          note?: string | null
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          added_by?: string
          created_at?: string
          dispute_id?: string
          id?: string
          note?: string | null
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          category: Database["public"]["Enums"]["dispute_category"]
          created_at: string
          discord_thread_id: string | null
          id: string
          match_id: string
          match_status_before:
            | Database["public"]["Enums"]["match_status"]
            | null
          opened_by: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["dispute_category"]
          created_at?: string
          discord_thread_id?: string | null
          id?: string
          match_id: string
          match_status_before?:
            | Database["public"]["Enums"]["match_status"]
            | null
          opened_by: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["dispute_category"]
          created_at?: string
          discord_thread_id?: string | null
          id?: string
          match_id?: string
          match_status_before?:
            | Database["public"]["Enums"]["match_status"]
            | null
          opened_by?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string
          id: string
          name: string
          season_id: string
          tier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          season_id: string
          tier?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          season_id?: string
          tier?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      eights_cancel_requests: {
        Row: {
          created_at: string
          match_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          match_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eights_cancel_requests_match_id_user_id_fkey"
            columns: ["match_id", "user_id"]
            isOneToOne: true
            referencedRelation: "eights_players"
            referencedColumns: ["match_id", "user_id"]
          },
        ]
      }
      eights_matches: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          map_id: string | null
          map_name: string | null
          message_id: string | null
          mode_id: string | null
          mode_name: string | null
          number: number
          resolved_at: string | null
          resolved_by: string | null
          status: string
          vote_ends_at: string | null
          winner: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          map_id?: string | null
          map_name?: string | null
          message_id?: string | null
          mode_id?: string | null
          mode_name?: string | null
          number?: never
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          vote_ends_at?: string | null
          winner?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          map_id?: string | null
          map_name?: string | null
          message_id?: string | null
          mode_id?: string | null
          mode_name?: string | null
          number?: never
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          vote_ends_at?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eights_matches_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_matches_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_matches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_matches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_matches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      eights_players: {
        Row: {
          match_id: string
          team: string
          user_id: string
        }
        Insert: {
          match_id: string
          team: string
          user_id: string
        }
        Update: {
          match_id?: string
          team?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eights_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "eights_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      eights_queue: {
        Row: {
          joined_at: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eights_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eights_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      eights_reports: {
        Row: {
          created_at: string
          match_id: string
          updated_at: string
          user_id: string
          winner: string
        }
        Insert: {
          created_at?: string
          match_id: string
          updated_at?: string
          user_id: string
          winner: string
        }
        Update: {
          created_at?: string
          match_id?: string
          updated_at?: string
          user_id?: string
          winner?: string
        }
        Relationships: [
          {
            foreignKeyName: "eights_reports_match_id_user_id_fkey"
            columns: ["match_id", "user_id"]
            isOneToOne: true
            referencedRelation: "eights_players"
            referencedColumns: ["match_id", "user_id"]
          },
        ]
      }
      eights_votes: {
        Row: {
          created_at: string
          match_id: string
          mode_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          match_id: string
          mode_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          match_id?: string
          mode_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eights_votes_match_id_user_id_fkey"
            columns: ["match_id", "user_id"]
            isOneToOne: true
            referencedRelation: "eights_players"
            referencedColumns: ["match_id", "user_id"]
          },
          {
            foreignKeyName: "eights_votes_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      free_agent_posts: {
        Row: {
          active: boolean
          availability: string | null
          created_at: string
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          note: string | null
          platform: Database["public"]["Enums"]["platform"]
          preferred_role: string | null
          season_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          availability?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          note?: string | null
          platform: Database["public"]["Enums"]["platform"]
          preferred_role?: string | null
          season_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          availability?: string | null
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          note?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          preferred_role?: string | null
          season_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_agent_posts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_modes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      gentlemens_agreements: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mode_id: string | null
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mode_id?: string | null
          sort_order?: number
          text: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mode_id?: string | null
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gentlemens_agreements_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      map_modes: {
        Row: {
          map_id: string
          mode_id: string
        }
        Insert: {
          map_id: string
          mode_id: string
        }
        Update: {
          map_id?: string
          mode_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_modes_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_modes_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_absences: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          match_id: string
          reason: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          match_id: string
          reason?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          match_id?: string
          reason?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_absences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_absences_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      match_maps: {
        Row: {
          away_score: number | null
          created_at: string
          home_score: number | null
          id: string
          map_id: string
          map_number: number
          match_id: string
          mode_id: string
          stats_status: Database["public"]["Enums"]["stats_status"]
          updated_at: string
          winner_team_id: string | null
        }
        Insert: {
          away_score?: number | null
          created_at?: string
          home_score?: number | null
          id?: string
          map_id: string
          map_number: number
          match_id: string
          mode_id: string
          stats_status?: Database["public"]["Enums"]["stats_status"]
          updated_at?: string
          winner_team_id?: string | null
        }
        Update: {
          away_score?: number | null
          created_at?: string
          home_score?: number | null
          id?: string
          map_id?: string
          map_number?: number
          match_id?: string
          mode_id?: string
          stats_status?: Database["public"]["Enums"]["stats_status"]
          updated_at?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_maps_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_maps_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "match_maps_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_maps_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_maps_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_series: number | null
          away_team_id: string
          broadcast_by: string | null
          broadcast_live: boolean
          broadcast_started_at: string | null
          broadcast_url: string | null
          confirmed_at: string | null
          created_at: string
          default_at: string
          discord_match_channel_closed_at: string | null
          discord_match_channel_id: string | null
          division_id: string | null
          forfeit_team_id: string | null
          home_series: number | null
          home_team_id: string
          id: string
          playoff_round: number | null
          result_source: Database["public"]["Enums"]["result_source"] | null
          scheduled_at: string
          season_id: string
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          vod_url: string | null
          week: number
          winner_team_id: string | null
        }
        Insert: {
          away_series?: number | null
          away_team_id: string
          broadcast_by?: string | null
          broadcast_live?: boolean
          broadcast_started_at?: string | null
          broadcast_url?: string | null
          confirmed_at?: string | null
          created_at?: string
          default_at: string
          discord_match_channel_closed_at?: string | null
          discord_match_channel_id?: string | null
          division_id?: string | null
          forfeit_team_id?: string | null
          home_series?: number | null
          home_team_id: string
          id?: string
          playoff_round?: number | null
          result_source?: Database["public"]["Enums"]["result_source"] | null
          scheduled_at: string
          season_id: string
          stage?: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          vod_url?: string | null
          week: number
          winner_team_id?: string | null
        }
        Update: {
          away_series?: number | null
          away_team_id?: string
          broadcast_by?: string | null
          broadcast_live?: boolean
          broadcast_started_at?: string | null
          broadcast_url?: string | null
          confirmed_at?: string | null
          created_at?: string
          default_at?: string
          discord_match_channel_closed_at?: string | null
          discord_match_channel_id?: string | null
          division_id?: string | null
          forfeit_team_id?: string | null
          home_series?: number | null
          home_team_id?: string
          id?: string
          playoff_round?: number | null
          result_source?: Database["public"]["Enums"]["result_source"] | null
          scheduled_at?: string
          season_id?: string
          stage?: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          vod_url?: string | null
          week?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_broadcast_by_fkey"
            columns: ["broadcast_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_broadcast_by_fkey"
            columns: ["broadcast_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_broadcast_by_fkey"
            columns: ["broadcast_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_forfeit_team_id_fkey"
            columns: ["forfeit_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: number
          last_error: string | null
          payload: Json
          sent_at: string | null
          type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: never
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          type?: string
        }
        Relationships: []
      }
      penalties: {
        Row: {
          created_at: string
          id: string
          issued_by: string
          match_id: string | null
          note: string | null
          team_id: string | null
          type: Database["public"]["Enums"]["penalty_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          issued_by: string
          match_id?: string | null
          note?: string | null
          team_id?: string | null
          type: Database["public"]["Enums"]["penalty_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          issued_by?: string
          match_id?: string | null
          note?: string | null
          team_id?: string | null
          type?: Database["public"]["Enums"]["penalty_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "penalties_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "penalties_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_discord_disputes: {
        Row: {
          attachment: Json | null
          created_at: string
          discord_user_id: string
          match_id: string
        }
        Insert: {
          attachment?: Json | null
          created_at?: string
          discord_user_id: string
          match_id: string
        }
        Update: {
          attachment?: Json | null
          created_at?: string
          discord_user_id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_discord_disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "pending_discord_disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_discord_reports: {
        Row: {
          attachments: Json
          created_at: string
          discord_user_id: string
          match_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          discord_user_id: string
          match_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          discord_user_id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_discord_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "pending_discord_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_map_stats: {
        Row: {
          created_at: string
          deaths: number
          id: string
          kills: number
          match_map_id: string
          score: number
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deaths: number
          id?: string
          kills: number
          match_map_id: string
          score: number
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deaths?: number
          id?: string
          kills?: number
          match_map_id?: string
          score?: number
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_map_stats_match_map_id_fkey"
            columns: ["match_map_id"]
            isOneToOne: false
            referencedRelation: "match_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stat_flags: {
        Row: {
          created_at: string
          flagged_by: string | null
          id: string
          note: string | null
          season_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flagged_by?: string | null
          id?: string
          note?: string | null
          season_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flagged_by?: string | null
          id?: string
          note?: string | null
          season_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_stat_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stat_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      preseason_interest: {
        Row: {
          discord_channel_id: string | null
          discord_message_id: string | null
          interested: boolean | null
          invited_at: string
          responded_at: string | null
          responded_by: string | null
          season_id: string
          team_id: string
        }
        Insert: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          interested?: boolean | null
          invited_at?: string
          responded_at?: string | null
          responded_by?: string | null
          season_id: string
          team_id: string
        }
        Update: {
          discord_channel_id?: string | null
          discord_message_id?: string | null
          interested?: boolean | null
          invited_at?: string
          responded_at?: string | null
          responded_by?: string | null
          season_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preseason_interest_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_interest_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_interest_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_interest_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_interest_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      preseason_pairings: {
        Row: {
          away_team_id: string
          created_at: string
          discord_channel_id: string | null
          home_team_id: string
          id: string
          match_id: string | null
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          away_team_id: string
          created_at?: string
          discord_channel_id?: string | null
          home_team_id: string
          id?: string
          match_id?: string | null
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          away_team_id?: string
          created_at?: string
          discord_channel_id?: string | null
          home_team_id?: string
          id?: string
          match_id?: string | null
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preseason_pairings_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_pairings_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_pairings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "preseason_pairings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_pairings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      preseason_proposals: {
        Row: {
          created_at: string
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          pairing_id: string
          proposed_at: string
          proposed_by: string
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["reschedule_status"]
          team_id: string
        }
        Insert: {
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          pairing_id: string
          proposed_at: string
          proposed_by: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["reschedule_status"]
          team_id: string
        }
        Update: {
          created_at?: string
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          pairing_id?: string
          proposed_at?: string
          proposed_by?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["reschedule_status"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preseason_proposals_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "preseason_pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preseason_proposals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activision_id: string | null
          age_confirmed_at: string | null
          avatar_url: string | null
          banned_until: string | null
          bio: string | null
          cod_rank: Database["public"]["Enums"]["cod_rank"] | null
          controller_confirmed_at: string | null
          created_at: string
          discord_id: string | null
          discord_profile_checked_at: string | null
          discord_synced_at: string | null
          discord_username: string | null
          favorite_weapon: string | null
          id: string
          is_free_agent: boolean
          is_player: boolean
          main_role: string | null
          platform: Database["public"]["Enums"]["platform"] | null
          profile_color: string | null
          rank_exception_at: string | null
          rank_exception_by: string | null
          tiktok_handle: string | null
          twitch_handle: string | null
          updated_at: string
          x_handle: string | null
          youtube_handle: string | null
        }
        Insert: {
          activision_id?: string | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          banned_until?: string | null
          bio?: string | null
          cod_rank?: Database["public"]["Enums"]["cod_rank"] | null
          controller_confirmed_at?: string | null
          created_at?: string
          discord_id?: string | null
          discord_profile_checked_at?: string | null
          discord_synced_at?: string | null
          discord_username?: string | null
          favorite_weapon?: string | null
          id: string
          is_free_agent?: boolean
          is_player?: boolean
          main_role?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          profile_color?: string | null
          rank_exception_at?: string | null
          rank_exception_by?: string | null
          tiktok_handle?: string | null
          twitch_handle?: string | null
          updated_at?: string
          x_handle?: string | null
          youtube_handle?: string | null
        }
        Update: {
          activision_id?: string | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          banned_until?: string | null
          bio?: string | null
          cod_rank?: Database["public"]["Enums"]["cod_rank"] | null
          controller_confirmed_at?: string | null
          created_at?: string
          discord_id?: string | null
          discord_profile_checked_at?: string | null
          discord_synced_at?: string | null
          discord_username?: string | null
          favorite_weapon?: string | null
          id?: string
          is_free_agent?: boolean
          is_player?: boolean
          main_role?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          profile_color?: string | null
          rank_exception_at?: string | null
          rank_exception_by?: string | null
          tiktok_handle?: string | null
          twitch_handle?: string | null
          updated_at?: string
          x_handle?: string | null
          youtube_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_rank_exception_by_fkey"
            columns: ["rank_exception_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rank_exception_by_fkey"
            columns: ["rank_exception_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rank_exception_by_fkey"
            columns: ["rank_exception_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      report_drafts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          maps: Json
          match_id: string
          screenshot_paths: string[]
          source: Database["public"]["Enums"]["submission_source"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          maps?: Json
          match_id: string
          screenshot_paths?: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          maps?: Json
          match_id?: string
          screenshot_paths?: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_drafts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "report_drafts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_drafts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_submissions: {
        Row: {
          away_series: number
          created_at: string
          home_series: number
          id: string
          maps: Json
          match_id: string
          player_stats: Json
          screenshot_paths: string[]
          source: Database["public"]["Enums"]["submission_source"]
          submitted_at: string
          submitted_by: string
          team_id: string
          updated_at: string
        }
        Insert: {
          away_series: number
          created_at?: string
          home_series: number
          id?: string
          maps?: Json
          match_id: string
          player_stats?: Json
          screenshot_paths?: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          submitted_at?: string
          submitted_by: string
          team_id: string
          updated_at?: string
        }
        Update: {
          away_series?: number
          created_at?: string
          home_series?: number
          id?: string
          maps?: Json
          match_id?: string
          player_stats?: Json
          screenshot_paths?: string[]
          source?: Database["public"]["Enums"]["submission_source"]
          submitted_at?: string
          submitted_by?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "report_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      reschedule_requests: {
        Row: {
          created_at: string
          id: string
          match_id: string
          proposed_at: string
          requested_by: string
          requested_by_team_id: string
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["reschedule_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          proposed_at: string
          requested_by: string
          requested_by_team_id: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["reschedule_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          proposed_at?: string
          requested_by?: string
          requested_by_team_id?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["reschedule_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reschedule_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "reschedule_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_requested_by_team_id_fkey"
            columns: ["requested_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_requests: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          note: string | null
          player_confirmed_at: string | null
          player_declined_at: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
          type: Database["public"]["Enums"]["roster_request_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          note?: string | null
          player_confirmed_at?: string | null
          player_declined_at?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          team_id: string
          type: Database["public"]["Enums"]["roster_request_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          note?: string | null
          player_confirmed_at?: string | null
          player_declined_at?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          team_id?: string
          type?: Database["public"]["Enums"]["roster_request_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "roster_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          banner_url: string | null
          created_at: string
          id: string
          match_nights: string[]
          match_time: string
          matches_per_week: number
          max_roster: number
          max_roster_changes: number
          max_starters: number
          max_subs: number
          name: string
          playoff_teams: number
          preseason_generated_at: string | null
          preseason_invites_at: string | null
          prize_text: string | null
          regular_weeks: number
          roster_lock_at: string | null
          signups_open_at: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["season_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          id?: string
          match_nights?: string[]
          match_time?: string
          matches_per_week?: number
          max_roster?: number
          max_roster_changes?: number
          max_starters?: number
          max_subs?: number
          name: string
          playoff_teams?: number
          preseason_generated_at?: string | null
          preseason_invites_at?: string | null
          prize_text?: string | null
          regular_weeks?: number
          roster_lock_at?: string | null
          signups_open_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["season_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          id?: string
          match_nights?: string[]
          match_time?: string
          matches_per_week?: number
          max_roster?: number
          max_roster_changes?: number
          max_starters?: number
          max_subs?: number
          name?: string
          playoff_teams?: number
          preseason_generated_at?: string | null
          preseason_invites_at?: string | null
          prize_text?: string | null
          regular_weeks?: number
          roster_lock_at?: string | null
          signups_open_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["season_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_mismatches: {
        Row: {
          away_value: string | null
          created_at: string
          field: string
          home_value: string | null
          id: string
          kind: Database["public"]["Enums"]["mismatch_kind"]
          match_map_id: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_value: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          away_value?: string | null
          created_at?: string
          field: string
          home_value?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mismatch_kind"]
          match_map_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_value?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          away_value?: string | null
          created_at?: string
          field?: string
          home_value?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mismatch_kind"]
          match_map_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_value?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stat_mismatches_match_map_id_fkey"
            columns: ["match_map_id"]
            isOneToOne: false
            referencedRelation: "match_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stat_mismatches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_volunteers: {
        Row: {
          created_at: string
          match_id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          match_id: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          match_id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_volunteers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "sub_volunteers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_volunteers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_volunteers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_volunteers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_volunteers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          responded_at: string | null
          role: Database["public"]["Enums"]["member_role"] | null
          status: Database["public"]["Enums"]["invite_status"]
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          status?: Database["public"]["Enums"]["invite_status"]
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          status?: Database["public"]["Enums"]["invite_status"]
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          emergency_match_id: string | null
          id: string
          is_emergency: boolean
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          season_id: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emergency_match_id?: string | null
          id?: string
          is_emergency?: boolean
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          season_id: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emergency_match_id?: string | null
          id?: string
          is_emergency?: boolean
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          season_id?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_emergency_match_fkey"
            columns: ["emergency_match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "team_members_emergency_match_fkey"
            columns: ["emergency_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_recruit_interest: {
        Row: {
          created_at: string
          notified_at: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notified_at?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notified_at?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_recruit_interest_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "team_recruit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_interest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_interest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_interest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_recruit_posts: {
        Row: {
          active: boolean
          availability: string | null
          closed_reason: string | null
          created_at: string
          created_by: string | null
          discord_channel_id: string | null
          discord_message_id: string | null
          id: string
          looking_for: string
          note: string | null
          roles: string[]
          season_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability?: string | null
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          looking_for: string
          note?: string | null
          roles?: string[]
          season_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability?: string | null
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          discord_channel_id?: string | null
          discord_message_id?: string | null
          id?: string
          looking_for?: string
          note?: string | null
          roles?: string[]
          season_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_recruit_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_posts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruit_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          banner_url: string | null
          captain_id: string
          co_captain_id: string | null
          created_at: string
          description: string | null
          discord_channel_id: string | null
          discord_role_id: string | null
          discord_voice_channel_id: string | null
          division_id: string | null
          forfeit_count: number
          id: string
          logo_url: string | null
          name: string
          review_note: string | null
          roster_changes_used: number
          season_id: string
          status: Database["public"]["Enums"]["team_status"]
          tag: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          captain_id: string
          co_captain_id?: string | null
          created_at?: string
          description?: string | null
          discord_channel_id?: string | null
          discord_role_id?: string | null
          discord_voice_channel_id?: string | null
          division_id?: string | null
          forfeit_count?: number
          id?: string
          logo_url?: string | null
          name: string
          review_note?: string | null
          roster_changes_used?: number
          season_id: string
          status?: Database["public"]["Enums"]["team_status"]
          tag: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          captain_id?: string
          co_captain_id?: string | null
          created_at?: string
          description?: string | null
          discord_channel_id?: string | null
          discord_role_id?: string | null
          discord_voice_channel_id?: string | null
          division_id?: string | null
          forfeit_count?: number
          id?: string
          logo_url?: string | null
          name?: string
          review_note?: string | null
          roster_changes_used?: number
          season_id?: string
          status?: Database["public"]["Enums"]["team_status"]
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_co_captain_id_fkey"
            columns: ["co_captain_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_co_captain_id_fkey"
            columns: ["co_captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_co_captain_id_fkey"
            columns: ["co_captain_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_log_public: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string | null
          id: number | null
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          summary: string | null
          table_name: string | null
        }
        Relationships: []
      }
      disputes_public: {
        Row: {
          category: Database["public"]["Enums"]["dispute_category"] | null
          created_at: string | null
          id: string | null
          match_id: string | null
          opened_by: string | null
          reason: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"] | null
          team_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["dispute_category"] | null
          created_at?: string | null
          id?: string | null
          match_id?: string | null
          opened_by?: string | null
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
          team_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["dispute_category"] | null
          created_at?: string | null
          id?: string | null
          match_id?: string | null
          opened_by?: string | null
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"] | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_results_v"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      free_agents: {
        Row: {
          activision_id: string | null
          availability: string | null
          avatar_url: string | null
          created_at: string | null
          id: string | null
          note: string | null
          platform: Database["public"]["Enums"]["platform"] | null
          preferred_role: string | null
          profile_complete: boolean | null
        }
        Relationships: []
      }
      match_results_v: {
        Row: {
          deciding_diff: number | null
          division_id: string | null
          is_home: boolean | null
          maps_lost: number | null
          maps_won: number | null
          match_id: string | null
          opponent_id: string | null
          playoff_round: number | null
          scheduled_at: string | null
          season_id: string | null
          stage: Database["public"]["Enums"]["match_stage"] | null
          status: Database["public"]["Enums"]["match_status"] | null
          team_id: string | null
          week: number | null
          won: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_season_stats_v: {
        Row: {
          activision_id: string | null
          avatar_url: string | null
          avg_score: number | null
          deaths: number | null
          kd: number | null
          kills: number | null
          maps_played: number | null
          plus_minus: number | null
          qualifies: boolean | null
          season_id: string | null
          team_id: string | null
          team_maps_played: number | null
          team_name: string | null
          team_tag: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "free_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          activision_id: string | null
          avatar_url: string | null
          banned_until: string | null
          created_at: string | null
          id: string | null
          is_free_agent: boolean | null
          platform: Database["public"]["Enums"]["platform"] | null
        }
        Insert: {
          activision_id?: string | null
          avatar_url?: string | null
          banned_until?: string | null
          created_at?: string | null
          id?: string | null
          is_free_agent?: boolean | null
          platform?: Database["public"]["Enums"]["platform"] | null
        }
        Update: {
          activision_id?: string | null
          avatar_url?: string | null
          banned_until?: string | null
          created_at?: string | null
          id?: string | null
          is_free_agent?: boolean | null
          platform?: Database["public"]["Enums"]["platform"] | null
        }
        Relationships: []
      }
      team_maps_played_v: {
        Row: {
          maps_played: number | null
          season_id: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      team_mode_records_v: {
        Row: {
          losses: number | null
          mode_id: string | null
          mode_name: string | null
          season_id: string | null
          team_id: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_maps_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_dispute_comment: {
        Args: { p_body: string; p_dispute_id: string }
        Returns: string
      }
      admin_clear_result: { Args: { p_match_id: string }; Returns: undefined }
      admin_delete_team: { Args: { p_team_id: string }; Returns: Json }
      admin_forfeit: {
        Args: { p_forfeit_team_id: string; p_match_id: string }
        Returns: undefined
      }
      admin_health: { Args: never; Returns: Json }
      admin_mismatch_queue: { Args: never; Returns: Json }
      admin_overview: { Args: never; Returns: Json }
      admin_set_result: {
        Args: { p_maps: Json; p_match_id: string }
        Returns: undefined
      }
      apply_map_resolutions: {
        Args: { p_match_map_id: string }
        Returns: undefined
      }
      apply_reports: {
        Args: {
          p_away: Database["public"]["Tables"]["report_submissions"]["Row"]
          p_home: Database["public"]["Tables"]["report_submissions"]["Row"]
          p_match_id: string
          p_source: Database["public"]["Enums"]["result_source"]
        }
        Returns: Database["public"]["Enums"]["match_status"]
      }
      audit_log_feed: {
        Args: never
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: string
          created_at: string
          id: number
          new_data: Json
          old_data: Json
          row_id: string
          summary: string
          table_name: string
        }[]
      }
      audit_row_label: {
        Args: { p_data: Json; p_row_id: string; p_table: string }
        Returns: string
      }
      audit_strip: { Args: { p: Json }; Returns: Json }
      audit_summary: {
        Args: {
          p_action: string
          p_actor_name: string
          p_actor_role: string
          p_new: Json
          p_old: Json
          p_row_id: string
          p_table: string
        }
        Returns: string
      }
      auto_confirm_reports: { Args: never; Returns: number }
      available_players: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: number
      }
      ban_player: {
        Args: { p_reason: string; p_until: string; p_user_id: string }
        Returns: undefined
      }
      broadcast_casters: {
        Args: { p_match_ids: string[] }
        Returns: {
          caster: string
          match_id: string
        }[]
      }
      can_emergency_sub: { Args: { p_user_id: string }; Returns: boolean }
      can_flag_player_stats: {
        Args: { p_season_id: string; p_user_id: string }
        Returns: boolean
      }
      can_staff_match: { Args: { p_match_id: string }; Returns: boolean }
      can_staff_match_for: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: boolean
      }
      can_staff_team: { Args: { p_team_id: string }; Returns: boolean }
      can_staff_team_for: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_invite: { Args: { p_invite_id: string }; Returns: undefined }
      cancel_reschedule: { Args: { p_request_id: string }; Returns: undefined }
      captain_team_for: { Args: { p_user_id: string }; Returns: string }
      check_in: {
        Args: { p_match_id: string; p_player_ids: string[] }
        Returns: Json
      }
      check_in_as: {
        Args: {
          p_match_id: string
          p_player_ids: string[]
          p_source?: Database["public"]["Enums"]["submission_source"]
          p_user_id: string
        }
        Returns: Json
      }
      claim_broadcast: {
        Args: { p_claim: boolean; p_match_id: string }
        Returns: undefined
      }
      compare_reports: {
        Args: { p_match_id: string }
        Returns: Database["public"]["Enums"]["match_status"]
      }
      create_matches: {
        Args: { p_matches: Json; p_replace?: boolean; p_season_id: string }
        Returns: number
      }
      delete_team_core: { Args: { p_team_id: string }; Returns: Json }
      disband_team: { Args: { p_team_id: string }; Returns: Json }
      discord_scheduler_tick: { Args: never; Returns: undefined }
      discord_sync_enqueue: {
        Args: { p_action: string; p_payload?: Json }
        Returns: undefined
      }
      discord_sync_secret: { Args: never; Returns: string }
      disputable_matches_for: {
        Args: { p_actor: string }
        Returns: {
          match_id: string
          opponent_tag: string
          scheduled_at: string
          team_id: string
          week: number
        }[]
      }
      dispute_thread_people: { Args: { p_dispute_id: string }; Returns: Json }
      division_standings: {
        Args: { p_division_id?: string; p_season_id: string }
        Returns: {
          deciding_diff: number
          h2h_wins: number
          last5: string[]
          logo_url: string
          losses: number
          map_diff: number
          maps_lost: number
          maps_won: number
          name: string
          needs_admin_decision: boolean
          played: number
          rank: number
          tag: string
          team_id: string
          wins: number
        }[]
      }
      eights_close_vote: { Args: { p_match_id: string }; Returns: boolean }
      eights_join: { Args: { p_user_id: string }; Returns: Json }
      eights_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          discord_id: string
          losses: number
          name: string
          played: number
          user_id: string
          win_pct: number
          wins: number
        }[]
      }
      eights_leave: { Args: { p_user_id: string }; Returns: boolean }
      eights_public_state: { Args: never; Returns: Json }
      eights_report: {
        Args: { p_match_id: string; p_user_id: string; p_winner: string }
        Returns: Json
      }
      eights_request_cancel: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: Json
      }
      eights_resolve: {
        Args: { p_actor: string; p_match_id: string; p_winner: string }
        Returns: undefined
      }
      eights_tick: { Args: never; Returns: undefined }
      eights_vote: {
        Args: { p_match_id: string; p_mode_id: string; p_user_id: string }
        Returns: Json
      }
      eights_vote_modes: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      eligible_checkin_players: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: {
          is_emergency: boolean
          name: string
          user_id: string
        }[]
      }
      enqueue_notification: {
        Args: { p_payload: Json; p_type: string }
        Returns: undefined
      }
      expire_reschedule_requests: { Args: never; Returns: number }
      free_agent_board: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_platform?: Database["public"]["Enums"]["platform"]
          p_role?: string
          p_search?: string
        }
        Returns: {
          activision_id: string
          availability: string
          avatar_url: string
          discord_username: string
          id: string
          note: string
          platform: Database["public"]["Enums"]["platform"]
          post_id: string
          posted_at: string
          preferred_role: string
          total_count: number
        }[]
      }
      hall_of_champions: {
        Args: never
        Returns: {
          champion_series: number
          division_name: string
          final_at: string
          logo_url: string
          opponent_name: string
          opponent_series: number
          opponent_tag: string
          season_id: string
          season_name: string
          starters: string[]
          team_id: string
          team_name: string
          team_tag: string
        }[]
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["staff_role"] }
        Returns: boolean
      }
      has_role_for: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      invitable_players: {
        Args: { p_limit?: number; p_search: string }
        Returns: {
          activision_id: string
          avatar_url: string
          discord_username: string
          id: string
          listed: boolean
          platform: Database["public"]["Enums"]["platform"]
        }[]
      }
      invite_player: {
        Args: {
          p_role?: Database["public"]["Enums"]["member_role"]
          p_team_id: string
          p_user_id: string
        }
        Returns: string
      }
      invite_player_as: {
        Args: {
          p_actor: string
          p_role?: Database["public"]["Enums"]["member_role"]
          p_team_id: string
          p_user_id: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_for: { Args: { p_user_id: string }; Returns: boolean }
      is_captain_in_match: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: boolean
      }
      is_captain_of: { Args: { p_team_id: string }; Returns: boolean }
      is_captain_of_for: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      is_caster: { Args: never; Returns: boolean }
      is_internal: { Args: never; Returns: boolean }
      is_on_team: { Args: { p_team_id: string }; Returns: boolean }
      is_on_team_for: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      is_owner: { Args: never; Returns: boolean }
      is_party_to_match: { Args: { p_match_id: string }; Returns: boolean }
      is_party_to_match_for: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: boolean
      }
      is_profile_complete: { Args: { p_user_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_staff_for: { Args: { p_user_id: string }; Returns: boolean }
      is_stream_url: { Args: { p_url: string }; Returns: boolean }
      leave_team: { Args: { p_team_id: string }; Returns: undefined }
      lfg_remove_as: { Args: { p_user_id: string }; Returns: Json }
      lfg_set_message: {
        Args: { p_channel_id: string; p_message_id: string; p_post_id: string }
        Returns: undefined
      }
      lfg_upsert_as: {
        Args: {
          p_availability: string
          p_note: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      like_pattern: { Args: { p: string }; Returns: string }
      live_broadcasts: {
        Args: never
        Returns: {
          away_name: string
          away_tag: string
          caster: string
          home_name: string
          home_tag: string
          match_id: string
          started_at: string
          url: string
        }[]
      }
      log_client_error: {
        Args: {
          p_message: string
          p_release?: string
          p_session_id?: string
          p_stack?: string
          p_url?: string
          p_user_agent?: string
        }
        Returns: boolean
      }
      match_captain_team: { Args: { p_match_id: string }; Returns: string }
      match_of_dispute: { Args: { p_dispute_id: string }; Returns: string }
      match_of_map: { Args: { p_match_map_id: string }; Returns: string }
      match_settled: { Args: { p_match_id: string }; Returns: boolean }
      my_discord_presence: {
        Args: never
        Returns: {
          checked_at: string
          in_server: boolean
        }[]
      }
      my_match_report_status: { Args: { p_match_id: string }; Returns: Json }
      my_team_ids: { Args: { p_season_id: string }; Returns: string[] }
      open_dispute: {
        Args: {
          p_category: Database["public"]["Enums"]["dispute_category"]
          p_description: string
          p_evidence?: Json
          p_match_id: string
        }
        Returns: string
      }
      open_dispute_as: {
        Args: {
          p_actor: string
          p_category: Database["public"]["Enums"]["dispute_category"]
          p_description: string
          p_evidence?: Json
          p_match_id: string
        }
        Returns: string
      }
      player_breakdown: {
        Args: { p_season_id?: string; p_user_id: string }
        Returns: Json
      }
      player_directory: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_player_id?: string
          p_search?: string
        }
        Returns: {
          activision_id: string
          avatar_url: string
          banned: boolean
          discord_username: string
          id: string
          is_captain: boolean
          is_co_captain: boolean
          is_free_agent: boolean
          joined_at: string
          platform: Database["public"]["Enums"]["platform"]
          team_id: string
          team_logo_url: string
          team_name: string
          team_role: Database["public"]["Enums"]["member_role"]
          team_tag: string
          total_count: number
        }[]
      }
      preseason_cancel_pairing: {
        Args: { p_pairing_id: string }
        Returns: undefined
      }
      preseason_cancel_proposal: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
      preseason_cancel_proposal_as: {
        Args: { p_actor: string; p_proposal_id: string }
        Returns: undefined
      }
      preseason_conflict: {
        Args: { p_at: string; p_ignore_match?: string; p_season_id: string }
        Returns: string
      }
      preseason_generate: {
        Args: { p_replace?: boolean; p_season_id: string }
        Returns: number
      }
      preseason_propose: {
        Args: { p_at: string; p_pairing_id: string }
        Returns: string
      }
      preseason_propose_as: {
        Args: { p_actor: string; p_at: string; p_pairing_id: string }
        Returns: string
      }
      preseason_respond: {
        Args: { p_accept: boolean; p_proposal_id: string }
        Returns: undefined
      }
      preseason_respond_as: {
        Args: { p_accept: boolean; p_actor: string; p_proposal_id: string }
        Returns: undefined
      }
      preseason_send_invites: { Args: { p_season_id: string }; Returns: number }
      preseason_set_interest: {
        Args: { p_interested: boolean; p_team_id: string }
        Returns: undefined
      }
      preseason_set_interest_as: {
        Args: { p_actor: string; p_interested: boolean; p_team_id: string }
        Returns: undefined
      }
      rank_block_reason: { Args: { p_user_id: string }; Returns: string }
      recruit_block_reason: {
        Args: { p_looking_for: string; p_team_id: string }
        Returns: string
      }
      recruit_board: {
        Args: never
        Returns: {
          availability: string
          logo_url: string
          looking_for: string
          note: string
          open: number
          post_id: string
          roles: string[]
          starters_open: number
          subs_open: number
          team_id: string
          team_name: string
          team_status: Database["public"]["Enums"]["team_status"]
          team_tag: string
          updated_at: string
        }[]
      }
      recruit_close: {
        Args: { p_reason: string; p_team_id: string }
        Returns: undefined
      }
      recruit_close_stale: { Args: never; Returns: number }
      recruit_interest: { Args: { p_post_id: string }; Returns: string }
      recruit_interest_as: {
        Args: { p_actor: string; p_post_id: string }
        Returns: string
      }
      recruit_remove: { Args: { p_post_id: string }; Returns: undefined }
      recruit_save: {
        Args: {
          p_availability: string
          p_looking_for: string
          p_note: string
          p_roles: string[]
          p_team_id: string
        }
        Returns: string
      }
      remove_player: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: undefined
      }
      report_int: {
        Args: { p: Json; p_key: string; p_label: string; p_max: number }
        Returns: number
      }
      reportable_matches_for: {
        Args: { p_actor: string }
        Returns: {
          away_tag: string
          home_tag: string
          match_id: string
          opponent_tag: string
          scheduled_at: string
          team_id: string
          week: number
        }[]
      }
      request_emergency_sub: {
        Args: {
          p_match_id: string
          p_note?: string
          p_out_ids?: string[]
          p_reason?: string
          p_team_id: string
          p_user_id: string
        }
        Returns: string
      }
      request_my_discord_sync: { Args: never; Returns: boolean }
      request_reschedule: {
        Args: { p_match_id: string; p_proposed_at: string }
        Returns: string
      }
      request_reschedule_as: {
        Args: { p_actor: string; p_match_id: string; p_proposed_at: string }
        Returns: string
      }
      reschedulable_matches_for: {
        Args: { p_actor: string }
        Returns: {
          default_at: string
          match_id: string
          opponent_name: string
          opponent_tag: string
          scheduled_at: string
          timezone: string
          week: number
        }[]
      }
      resolve_mismatch: {
        Args: { p_choice: string; p_mismatch_id: string; p_value?: string }
        Returns: Json
      }
      respond_emergency_sub: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: Json
      }
      respond_emergency_sub_as: {
        Args: { p_accept: boolean; p_actor: string; p_request_id: string }
        Returns: Json
      }
      respond_reschedule: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: undefined
      }
      respond_reschedule_as: {
        Args: { p_accept: boolean; p_actor: string; p_request_id: string }
        Returns: Database["public"]["Enums"]["reschedule_status"]
      }
      respond_to_invite: {
        Args: { p_accept: boolean; p_invite_id: string }
        Returns: undefined
      }
      respond_to_invite_as: {
        Args: { p_accept: boolean; p_actor: string; p_invite_id: string }
        Returns: string
      }
      season_leaderboard: {
        Args: { p_season_id: string }
        Returns: {
          activision_id: string
          avatar_url: string
          avg_score: number
          deaths: number
          incomplete: boolean
          incomplete_reason: string
          kd: number
          kills: number
          maps_played: number
          plus_minus: number
          team_id: string
          team_name: string
          team_tag: string
          user_id: string
        }[]
      }
      series_from_maps: { Args: { p_match_id: string }; Returns: Json }
      set_broadcast: {
        Args: { p_live: boolean; p_match_id: string; p_url?: string }
        Returns: undefined
      }
      set_rank_exception: {
        Args: { p_approve: boolean; p_user_id: string }
        Returns: undefined
      }
      set_vod: {
        Args: { p_match_id: string; p_url: string }
        Returns: undefined
      }
      site_counts: {
        Args: never
        Returns: {
          matches: number
          players: number
          teams: number
        }[]
      }
      sub_board: {
        Args: never
        Returns: {
          match_id: string
          needed: number
          opponent_name: string
          opponent_tag: string
          scheduled_at: string
          team_channel_id: string
          team_id: string
          team_name: string
          team_tag: string
          volunteers: Json
        }[]
      }
      submit_report: {
        Args: {
          p_match_id: string
          p_report: Json
          p_source?: Database["public"]["Enums"]["submission_source"]
        }
        Returns: Database["public"]["Enums"]["match_status"]
      }
      team_discord_presence: {
        Args: { p_team_id: string }
        Returns: {
          checked_at: string
          in_server: boolean
          user_id: string
        }[]
      }
      team_open_spots: {
        Args: { p_team_id: string }
        Returns: {
          open: number
          starters_open: number
          subs_open: number
        }[]
      }
      transfer_captaincy: {
        Args: { p_new_captain: string; p_team_id: string }
        Returns: undefined
      }
      try_uuid: { Args: { p: string }; Returns: string }
      volunteer_for_sub_as: {
        Args: {
          p_actor: string
          p_available: boolean
          p_match_id: string
          p_team_id: string
        }
        Returns: string
      }
      week_top_players: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: {
          avg_score: number
          deaths: number
          discord_id: string
          kd: number
          kills: number
          maps: number
          name: string
          team_tag: string
          user_id: string
        }[]
      }
    }
    Enums: {
      cod_rank:
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "diamond"
        | "crimson"
        | "iridescent"
        | "top250"
      dispute_category:
        | "score"
        | "stats"
        | "conduct"
        | "cheating"
        | "eligibility"
        | "other"
      dispute_status: "open" | "resolved"
      invite_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "expired"
      match_stage: "regular" | "playoff" | "preseason"
      match_status:
        | "scheduled"
        | "checkin_open"
        | "live"
        | "awaiting_reports"
        | "disputed"
        | "confirmed"
        | "forfeit"
        | "cancelled"
      member_role: "starter" | "sub"
      mismatch_kind: "map_score" | "player_stat"
      penalty_type:
        | "warning"
        | "map_forfeit"
        | "series_forfeit"
        | "suspension"
        | "ban"
        | "team_removal"
        | "other"
      platform: "playstation" | "xbox" | "pc"
      request_status: "pending" | "approved" | "denied"
      reschedule_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      result_source: "double_entry" | "single_report" | "admin" | "forfeit"
      roster_request_type: "add" | "drop" | "emergency_sub"
      season_status: "draft" | "signups" | "regular" | "playoffs" | "complete"
      staff_role: "owner" | "admin" | "caster"
      stats_status: "pending" | "confirmed" | "mismatch"
      submission_source: "site" | "discord"
      team_status: "pending" | "approved" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cod_rank: [
        "bronze",
        "silver",
        "gold",
        "platinum",
        "diamond",
        "crimson",
        "iridescent",
        "top250",
      ],
      dispute_category: [
        "score",
        "stats",
        "conduct",
        "cheating",
        "eligibility",
        "other",
      ],
      dispute_status: ["open", "resolved"],
      invite_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "expired",
      ],
      match_stage: ["regular", "playoff", "preseason"],
      match_status: [
        "scheduled",
        "checkin_open",
        "live",
        "awaiting_reports",
        "disputed",
        "confirmed",
        "forfeit",
        "cancelled",
      ],
      member_role: ["starter", "sub"],
      mismatch_kind: ["map_score", "player_stat"],
      penalty_type: [
        "warning",
        "map_forfeit",
        "series_forfeit",
        "suspension",
        "ban",
        "team_removal",
        "other",
      ],
      platform: ["playstation", "xbox", "pc"],
      request_status: ["pending", "approved", "denied"],
      reschedule_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      result_source: ["double_entry", "single_report", "admin", "forfeit"],
      roster_request_type: ["add", "drop", "emergency_sub"],
      season_status: ["draft", "signups", "regular", "playoffs", "complete"],
      staff_role: ["owner", "admin", "caster"],
      stats_status: ["pending", "confirmed", "mismatch"],
      submission_source: ["site", "discord"],
      team_status: ["pending", "approved", "removed"],
    },
  },
} as const
