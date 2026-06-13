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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      animation_tunings: {
        Row: {
          anim_key: string
          off_x: number
          off_y: number
          off_z: number
          rot_x: number
          rot_y: number
          rot_z: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anim_key: string
          off_x?: number
          off_y?: number
          off_z?: number
          rot_x?: number
          rot_y?: number
          rot_z?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anim_key?: string
          off_x?: number
          off_y?: number
          off_z?: number
          rot_x?: number
          rot_y?: number
          rot_z?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bot_animations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          url?: string
        }
        Relationships: []
      }
      bot_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_animation_url: string | null
          default_scale: number
          glb_url: string
          id: string
          name: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_animation_url?: string | null
          default_scale?: number
          glb_url: string
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_animation_url?: string | null
          default_scale?: number
          glb_url?: string
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cars_catalog: {
        Row: {
          acceleration: number
          brake_force: number
          chassis_offset_y: number
          chassis_scale: number
          chassis_url: string
          created_at: string
          created_by: string | null
          id: string
          max_speed: number
          name: string
          slug: string
          thumb: string
          turn_speed: number
          updated_at: string
          wheel_offsets: Json
          wheel_radius: number
          wheel_url: string | null
        }
        Insert: {
          acceleration?: number
          brake_force?: number
          chassis_offset_y?: number
          chassis_scale?: number
          chassis_url: string
          created_at?: string
          created_by?: string | null
          id?: string
          max_speed?: number
          name: string
          slug: string
          thumb?: string
          turn_speed?: number
          updated_at?: string
          wheel_offsets?: Json
          wheel_radius?: number
          wheel_url?: string | null
        }
        Update: {
          acceleration?: number
          brake_force?: number
          chassis_offset_y?: number
          chassis_scale?: number
          chassis_url?: string
          created_at?: string
          created_by?: string | null
          id?: string
          max_speed?: number
          name?: string
          slug?: string
          thumb?: string
          turn_speed?: number
          updated_at?: string
          wheel_offsets?: Json
          wheel_radius?: number
          wheel_url?: string | null
        }
        Relationships: []
      }
      characters: {
        Row: {
          base_url: string | null
          created_at: string
          dance_url: string | null
          id: string
          idle_url: string | null
          jump_url: string | null
          name: string
          position: number
          run_url: string | null
          slug: string
          thumbnail_url: string | null
          updated_at: string
          walk_url: string | null
          wave_url: string | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          dance_url?: string | null
          id?: string
          idle_url?: string | null
          jump_url?: string | null
          name: string
          position?: number
          run_url?: string | null
          slug: string
          thumbnail_url?: string | null
          updated_at?: string
          walk_url?: string | null
          wave_url?: string | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          dance_url?: string | null
          id?: string
          idle_url?: string | null
          jump_url?: string | null
          name?: string
          position?: number
          run_url?: string | null
          slug?: string
          thumbnail_url?: string | null
          updated_at?: string
          walk_url?: string | null
          wave_url?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          avatar_url: string | null
          color: string
          created_at: string
          id: string
          map_id: string
          nickname: string
          text: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          color?: string
          created_at?: string
          id?: string
          map_id?: string
          nickname: string
          text: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          color?: string
          created_at?: string
          id?: string
          map_id?: string
          nickname?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_maps: {
        Row: {
          bg: string
          created_at: string
          created_by: string | null
          hidden: boolean
          id: string
          mood: string
          name: string
          slug: string
          thumb: string
          updated_at: string
          url: string | null
        }
        Insert: {
          bg?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          mood?: string
          name: string
          slug: string
          thumb?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          bg?: string
          created_at?: string
          created_by?: string | null
          hidden?: boolean
          id?: string
          mood?: string
          name?: string
          slug?: string
          thumb?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      delivery_destinations: {
        Row: {
          created_at: string
          hub_id: string
          id: string
          label: string
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at?: string
          hub_id: string
          id?: string
          label?: string
          x: number
          y?: number
          z: number
        }
        Update: {
          created_at?: string
          hub_id?: string
          id?: string
          label?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_destinations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "delivery_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_hubs: {
        Row: {
          active: boolean
          base_pay_cents: number
          base_time_ms: number
          bonus_pay_cents: number
          created_at: string
          id: string
          map_id: string | null
          min_level: number
          name: string
          pay_per_km_cents: number
          pickup_x: number
          pickup_y: number
          pickup_z: number
          time_per_100m_ms: number
        }
        Insert: {
          active?: boolean
          base_pay_cents?: number
          base_time_ms?: number
          bonus_pay_cents?: number
          created_at?: string
          id?: string
          map_id?: string | null
          min_level?: number
          name?: string
          pay_per_km_cents?: number
          pickup_x: number
          pickup_y?: number
          pickup_z: number
          time_per_100m_ms?: number
        }
        Update: {
          active?: boolean
          base_pay_cents?: number
          base_time_ms?: number
          bonus_pay_cents?: number
          created_at?: string
          id?: string
          map_id?: string | null
          min_level?: number
          name?: string
          pay_per_km_cents?: number
          pickup_x?: number
          pickup_y?: number
          pickup_z?: number
          time_per_100m_ms?: number
        }
        Relationships: []
      }
      delivery_jobs: {
        Row: {
          completed_at: string | null
          destination_id: string
          distance_m: number
          hub_id: string
          id: string
          payout_cents: number | null
          started_at: string
          status: string
          time_limit_ms: number
          user_id: string
          xp_gained: number | null
        }
        Insert: {
          completed_at?: string | null
          destination_id: string
          distance_m: number
          hub_id: string
          id?: string
          payout_cents?: number | null
          started_at?: string
          status?: string
          time_limit_ms: number
          user_id: string
          xp_gained?: number | null
        }
        Update: {
          completed_at?: string | null
          destination_id?: string
          distance_m?: number
          hub_id?: string
          id?: string
          payout_cents?: number | null
          started_at?: string
          status?: string
          time_limit_ms?: number
          user_id?: string
          xp_gained?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_jobs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "delivery_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_jobs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "delivery_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_stats: {
        Row: {
          best_time_ms: number | null
          deliveries_completed: number
          level: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          best_time_ms?: number | null
          deliveries_completed?: number
          level?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          best_time_ms?: number | null
          deliveries_completed?: number
          level?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          created_at: string
          from_user: string
          id: string
          read_at: string | null
          text: string
          to_user: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          read_at?: string | null
          text: string
          to_user: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          read_at?: string | null
          text?: string
          to_user?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          from_user: string
          id: string
          status: string
          to_user: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          status?: string
          to_user: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          status?: string
          to_user?: string
          updated_at?: string
        }
        Relationships: []
      }
      interaction_templates: {
        Row: {
          animation_key: string
          animation_url: string | null
          auto_despawn_ms: number
          bot_animation_url: string | null
          created_at: string
          created_by: string | null
          exit_radius: number
          icon: string
          id: string
          item_slug: string | null
          item_spawn_offset_x: number
          item_spawn_offset_y: number
          item_spawn_offset_z: number
          kind: string
          label: string
          loop: boolean
          name: string
          occupancy: string
          offset_x: number
          offset_y: number
          offset_z: number
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale_mul: number
          service_duration_ms: number
          trigger_radius: number
          updated_at: string
        }
        Insert: {
          animation_key?: string
          animation_url?: string | null
          auto_despawn_ms?: number
          bot_animation_url?: string | null
          created_at?: string
          created_by?: string | null
          exit_radius?: number
          icon?: string
          id?: string
          item_slug?: string | null
          item_spawn_offset_x?: number
          item_spawn_offset_y?: number
          item_spawn_offset_z?: number
          kind?: string
          label?: string
          loop?: boolean
          name: string
          occupancy?: string
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_mul?: number
          service_duration_ms?: number
          trigger_radius?: number
          updated_at?: string
        }
        Update: {
          animation_key?: string
          animation_url?: string | null
          auto_despawn_ms?: number
          bot_animation_url?: string | null
          created_at?: string
          created_by?: string | null
          exit_radius?: number
          icon?: string
          id?: string
          item_slug?: string | null
          item_spawn_offset_x?: number
          item_spawn_offset_y?: number
          item_spawn_offset_z?: number
          kind?: string
          label?: string
          loop?: boolean
          name?: string
          occupancy?: string
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_mul?: number
          service_duration_ms?: number
          trigger_radius?: number
          updated_at?: string
        }
        Relationships: []
      }
      item_catalog: {
        Row: {
          created_at: string
          created_by: string | null
          drink_animation_url: string | null
          glb_url: string
          hold_bone: string
          hold_offset_x: number
          hold_offset_y: number
          hold_offset_z: number
          hold_rot_x: number
          hold_rot_y: number
          hold_rot_z: number
          hold_scale: number
          id: string
          name: string
          scale: number
          slug: string
          spawn_offset_y: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drink_animation_url?: string | null
          glb_url: string
          hold_bone?: string
          hold_offset_x?: number
          hold_offset_y?: number
          hold_offset_z?: number
          hold_rot_x?: number
          hold_rot_y?: number
          hold_rot_z?: number
          hold_scale?: number
          id?: string
          name: string
          scale?: number
          slug: string
          spawn_offset_y?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drink_animation_url?: string | null
          glb_url?: string
          hold_bone?: string
          hold_offset_x?: number
          hold_offset_y?: number
          hold_offset_z?: number
          hold_rot_x?: number
          hold_rot_y?: number
          hold_rot_z?: number
          hold_scale?: number
          id?: string
          name?: string
          scale?: number
          slug?: string
          spawn_offset_y?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_asset_interactions: {
        Row: {
          animation_key: string
          animation_url: string | null
          asset_id: string | null
          auto_despawn_ms: number
          bot_animation_url: string | null
          bot_id: string | null
          created_at: string
          created_by: string | null
          exit_radius: number
          icon: string
          id: string
          item_slug: string | null
          item_spawn_offset_x: number
          item_spawn_offset_y: number
          item_spawn_offset_z: number
          kind: string
          label: string
          loop: boolean
          map_id: string
          occupancy: string
          offset_x: number
          offset_y: number
          offset_z: number
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale_mul: number
          service_duration_ms: number
          trigger_radius: number
          updated_at: string
        }
        Insert: {
          animation_key?: string
          animation_url?: string | null
          asset_id?: string | null
          auto_despawn_ms?: number
          bot_animation_url?: string | null
          bot_id?: string | null
          created_at?: string
          created_by?: string | null
          exit_radius?: number
          icon?: string
          id?: string
          item_slug?: string | null
          item_spawn_offset_x?: number
          item_spawn_offset_y?: number
          item_spawn_offset_z?: number
          kind?: string
          label?: string
          loop?: boolean
          map_id: string
          occupancy?: string
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_mul?: number
          service_duration_ms?: number
          trigger_radius?: number
          updated_at?: string
        }
        Update: {
          animation_key?: string
          animation_url?: string | null
          asset_id?: string | null
          auto_despawn_ms?: number
          bot_animation_url?: string | null
          bot_id?: string | null
          created_at?: string
          created_by?: string | null
          exit_radius?: number
          icon?: string
          id?: string
          item_slug?: string | null
          item_spawn_offset_x?: number
          item_spawn_offset_y?: number
          item_spawn_offset_z?: number
          kind?: string
          label?: string
          loop?: boolean
          map_id?: string
          occupancy?: string
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_mul?: number
          service_duration_ms?: number
          trigger_radius?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_asset_interactions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "map_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      map_assets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          map_id: string
          name: string
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale: number
          updated_at: string
          url: string
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_id?: string
          name: string
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale?: number
          updated_at?: string
          url: string
          x?: number
          y?: number
          z?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_id?: string
          name?: string
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale?: number
          updated_at?: string
          url?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      map_bots: {
        Row: {
          animation_url: string | null
          character_slug: string | null
          created_at: string
          created_by: string | null
          glb_url: string | null
          id: string
          map_id: string
          name: string
          rotation_y: number
          scale: number
          template_id: string | null
          updated_at: string
          x: number
          y: number
          z: number
        }
        Insert: {
          animation_url?: string | null
          character_slug?: string | null
          created_at?: string
          created_by?: string | null
          glb_url?: string | null
          id?: string
          map_id: string
          name?: string
          rotation_y?: number
          scale?: number
          template_id?: string | null
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Update: {
          animation_url?: string | null
          character_slug?: string | null
          created_at?: string
          created_by?: string | null
          glb_url?: string | null
          id?: string
          map_id?: string
          name?: string
          rotation_y?: number
          scale?: number
          template_id?: string | null
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_bots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bot_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      map_cars: {
        Row: {
          acceleration: number
          brake_force: number
          catalog_id: string | null
          chassis_offset_y: number
          chassis_scale: number
          chassis_url: string
          created_at: string
          created_by: string | null
          driver_since: string | null
          driver_user_id: string | null
          id: string
          map_id: string
          max_speed: number
          name: string
          rotation_y: number
          turn_speed: number
          updated_at: string
          wheel_offsets: Json
          wheel_radius: number
          wheel_url: string | null
          x: number
          y: number
          z: number
        }
        Insert: {
          acceleration?: number
          brake_force?: number
          catalog_id?: string | null
          chassis_offset_y?: number
          chassis_scale?: number
          chassis_url: string
          created_at?: string
          created_by?: string | null
          driver_since?: string | null
          driver_user_id?: string | null
          id?: string
          map_id: string
          max_speed?: number
          name?: string
          rotation_y?: number
          turn_speed?: number
          updated_at?: string
          wheel_offsets?: Json
          wheel_radius?: number
          wheel_url?: string | null
          x?: number
          y?: number
          z?: number
        }
        Update: {
          acceleration?: number
          brake_force?: number
          catalog_id?: string | null
          chassis_offset_y?: number
          chassis_scale?: number
          chassis_url?: string
          created_at?: string
          created_by?: string | null
          driver_since?: string | null
          driver_user_id?: string | null
          id?: string
          map_id?: string
          max_speed?: number
          name?: string
          rotation_y?: number
          turn_speed?: number
          updated_at?: string
          wheel_offsets?: Json
          wheel_radius?: number
          wheel_url?: string | null
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_cars_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "cars_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      map_item_instances: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          item_slug: string
          map_id: string
          rotation_y: number
          source_interaction_id: string | null
          spawned_by: string | null
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          item_slug: string
          map_id: string
          rotation_y?: number
          source_interaction_id?: string | null
          spawned_by?: string | null
          x?: number
          y?: number
          z?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          item_slug?: string
          map_id?: string
          rotation_y?: number
          source_interaction_id?: string | null
          spawned_by?: string | null
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      map_lights: {
        Row: {
          angle_deg: number
          cast_shadow: boolean
          color: string
          created_at: string
          created_by: string | null
          distance: number
          enabled: boolean
          id: string
          intensity: number
          kind: string
          map_id: string
          name: string
          penumbra: number
          pos_x: number
          pos_y: number
          pos_z: number
          radius: number
          target_x: number
          target_y: number
          target_z: number
          updated_at: string
        }
        Insert: {
          angle_deg?: number
          cast_shadow?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          distance?: number
          enabled?: boolean
          id?: string
          intensity?: number
          kind?: string
          map_id: string
          name?: string
          penumbra?: number
          pos_x?: number
          pos_y?: number
          pos_z?: number
          radius?: number
          target_x?: number
          target_y?: number
          target_z?: number
          updated_at?: string
        }
        Update: {
          angle_deg?: number
          cast_shadow?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          distance?: number
          enabled?: boolean
          id?: string
          intensity?: number
          kind?: string
          map_id?: string
          name?: string
          penumbra?: number
          pos_x?: number
          pos_y?: number
          pos_z?: number
          radius?: number
          target_x?: number
          target_y?: number
          target_z?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_portals: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          dest_map_id: string
          dest_portal_id: string | null
          height: number
          id: string
          label: string
          map_id: string
          pos_x: number
          pos_y: number
          pos_z: number
          radius: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          dest_map_id: string
          dest_portal_id?: string | null
          height?: number
          id?: string
          label?: string
          map_id: string
          pos_x?: number
          pos_y?: number
          pos_z?: number
          radius?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          dest_map_id?: string
          dest_portal_id?: string | null
          height?: number
          id?: string
          label?: string
          map_id?: string
          pos_x?: number
          pos_y?: number
          pos_z?: number
          radius?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_radios: {
        Row: {
          genre: string
          is_playing: boolean
          map_id: string
          station_name: string
          stream_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          genre?: string
          is_playing?: boolean
          map_id: string
          station_name?: string
          stream_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          genre?: string
          is_playing?: boolean
          map_id?: string
          station_name?: string
          stream_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      map_thumbnails: {
        Row: {
          created_at: string
          map_id: string
          thumb_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          map_id: string
          thumb_url: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          map_id?: string
          thumb_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      map_transforms: {
        Row: {
          dark_mode: boolean
          map_id: string
          mood: string | null
          offset_x: number
          offset_y: number
          offset_z: number
          rotation_y: number
          scale_mul: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dark_mode?: boolean
          map_id: string
          mood?: string | null
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_y?: number
          scale_mul?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dark_mode?: boolean
          map_id?: string
          mood?: string | null
          offset_x?: number
          offset_y?: number
          offset_z?: number
          rotation_y?: number
          scale_mul?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      npc_animations: {
        Row: {
          created_at: string
          created_by: string | null
          gender: string
          id: string
          model_url: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gender?: string
          id?: string
          model_url: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gender?: string
          id?: string
          model_url?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      npc_conversations: {
        Row: {
          created_at: string
          id: string
          last_user_msg_at: string
          npc_id: string
          role: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_user_msg_at?: string
          npc_id: string
          role: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_user_msg_at?: string
          npc_id?: string
          role?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "npc_conversations_npc_id_fkey"
            columns: ["npc_id"]
            isOneToOne: false
            referencedRelation: "npc_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      npc_instances: {
        Row: {
          active: boolean
          backstory: string | null
          created_at: string
          display_name: string
          id: string
          map_id: string | null
          model_id: string
          persona: Json
          route_id: string | null
          voice_id: string | null
        }
        Insert: {
          active?: boolean
          backstory?: string | null
          created_at?: string
          display_name?: string
          id?: string
          map_id?: string | null
          model_id: string
          persona?: Json
          route_id?: string | null
          voice_id?: string | null
        }
        Update: {
          active?: boolean
          backstory?: string | null
          created_at?: string
          display_name?: string
          id?: string
          map_id?: string | null
          model_id?: string
          persona?: Json
          route_id?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "npc_instances_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "npc_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npc_instances_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "npc_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      npc_models: {
        Row: {
          created_at: string
          created_by: string | null
          default_persona: Json
          gender: string
          id: string
          model_url: string
          name: string
          scale_mul: number
          slug: string
          thumbnail_url: string | null
          updated_at: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_persona?: Json
          gender?: string
          id?: string
          model_url: string
          name: string
          scale_mul?: number
          slug: string
          thumbnail_url?: string | null
          updated_at?: string
          voice_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_persona?: Json
          gender?: string
          id?: string
          model_url?: string
          name?: string
          scale_mul?: number
          slug?: string
          thumbnail_url?: string | null
          updated_at?: string
          voice_id?: string
        }
        Relationships: []
      }
      npc_routes: {
        Row: {
          created_at: string
          id: string
          loop_back: boolean
          map_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          loop_back?: boolean
          map_id?: string | null
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          loop_back?: boolean
          map_id?: string | null
          name?: string
        }
        Relationships: []
      }
      npc_state: {
        Row: {
          anim: string
          next_decision_at: string
          npc_id: string
          rot_y: number
          status: string
          target_wp_seq: number
          updated_at: string
          x: number
          y: number
          z: number
        }
        Insert: {
          anim?: string
          next_decision_at?: string
          npc_id: string
          rot_y?: number
          status?: string
          target_wp_seq?: number
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Update: {
          anim?: string
          next_decision_at?: string
          npc_id?: string
          rot_y?: number
          status?: string
          target_wp_seq?: number
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "npc_state_npc_id_fkey"
            columns: ["npc_id"]
            isOneToOne: true
            referencedRelation: "npc_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      npc_waypoints: {
        Row: {
          created_at: string
          id: string
          is_crosswalk: boolean
          is_sit_spot: boolean
          is_talk_spot: boolean
          pause_ms: number
          route_id: string
          seq: number
          sit_template_id: string | null
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_crosswalk?: boolean
          is_sit_spot?: boolean
          is_talk_spot?: boolean
          pause_ms?: number
          route_id: string
          seq: number
          sit_template_id?: string | null
          x: number
          y?: number
          z: number
        }
        Update: {
          created_at?: string
          id?: string
          is_crosswalk?: boolean
          is_sit_spot?: boolean
          is_talk_spot?: boolean
          pause_ms?: number
          route_id?: string
          seq?: number
          sit_template_id?: string | null
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "npc_waypoints_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "npc_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          created_at: string
          id: string
          position: number
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance_cents: number
          bio: string | null
          character_slug: string | null
          color: string
          created_at: string
          id: string
          nickname: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          balance_cents?: number
          bio?: string | null
          character_slug?: string | null
          color?: string
          created_at?: string
          id: string
          nickname?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          balance_cents?: number
          bio?: string | null
          character_slug?: string | null
          color?: string
          created_at?: string
          id?: string
          nickname?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_avatars: {
        Row: {
          base_url: string
          created_at: string
          id: string
          name: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _send_push_event: {
        Args: {
          _body: string
          _tag: string
          _title: string
          _url: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      complete_delivery: {
        Args: { _job_id: string; _player_x: number; _player_z: number }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_old_chat_messages: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
