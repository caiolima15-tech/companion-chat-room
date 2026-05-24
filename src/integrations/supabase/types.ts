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
          character_slug: string
          created_at: string
          created_by: string | null
          id: string
          map_id: string
          name: string
          rotation_y: number
          scale: number
          updated_at: string
          x: number
          y: number
          z: number
        }
        Insert: {
          animation_url?: string | null
          character_slug: string
          created_at?: string
          created_by?: string | null
          id?: string
          map_id: string
          name?: string
          rotation_y?: number
          scale?: number
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Update: {
          animation_url?: string | null
          character_slug?: string
          created_at?: string
          created_by?: string | null
          id?: string
          map_id?: string
          name?: string
          rotation_y?: number
          scale?: number
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
