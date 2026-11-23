
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "enrollments": {
                  Row: {
                    "created_at": string,"retailer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"retailer_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"retailer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    }
                  ]
                },"pickups": {
                  Row: {
                    "created_at": string,"id": string,"location_label": string | null,"note": string | null,"picked_up_on": string,"retailer_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"location_label"?: string | null,"note"?: string | null,"picked_up_on": string,"retailer_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"location_label"?: string | null,"note"?: string | null,"picked_up_on"?: string,"retailer_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickups_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "birth_day": number | null,"birth_month": number | null,"created_at": string,"display_name": string | null,"id": string,"onboarded_at": string | null,"password_set_at": string | null,"reminders_enabled": boolean,"time_zone": string | null,"updated_at": string,"welcome_email_sent_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_day"?: number | null,"birth_month"?: number | null,"created_at"?: string,"display_name"?: string | null,"id": string,"onboarded_at"?: string | null,"password_set_at"?: string | null,"reminders_enabled"?: boolean,"time_zone"?: string | null,"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Update: {
                    "birth_day"?: number | null,"birth_month"?: number | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"onboarded_at"?: string | null,"password_set_at"?: string | null,"reminders_enabled"?: boolean,"time_zone"?: string | null,"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"retailers": {
                  Row: {
                    "category": Database["public"]['Enums']["retailer_category"],"created_at": string,"days_after": number | null,"days_before": number | null,"description": string,"id": string,"is_popular": boolean,"last_checked_on": string,"logo_file": string | null,"membership_requirement": string | null,"name": string,"other_requirement": string | null,"purchase_requirement": string | null,"requires_purchase": boolean,"retired_at": string | null,"reward_description": string,"reward_type": Database["public"]['Enums']["reward_type"],"signup_lead_days": number | null,"source_url": string,"state_codes": (string)[],"states_scope": Database["public"]['Enums']["states_scope"],"store_finder_url": string | null,"timing_type": Database["public"]['Enums']["timing_type"],"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["retailer_category"],"created_at"?: string,"days_after"?: number | null,"days_before"?: number | null,"description": string,"id": string,"is_popular"?: boolean,"last_checked_on": string,"logo_file"?: string | null,"membership_requirement"?: string | null,"name": string,"other_requirement"?: string | null,"purchase_requirement"?: string | null,"requires_purchase": boolean,"retired_at"?: string | null,"reward_description": string,"reward_type": Database["public"]['Enums']["reward_type"],"signup_lead_days"?: number | null,"source_url": string,"state_codes"?: (string)[],"states_scope": Database["public"]['Enums']["states_scope"],"store_finder_url"?: string | null,"timing_type": Database["public"]['Enums']["timing_type"],"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["retailer_category"],"created_at"?: string,"days_after"?: number | null,"days_before"?: number | null,"description"?: string,"id"?: string,"is_popular"?: boolean,"last_checked_on"?: string,"logo_file"?: string | null,"membership_requirement"?: string | null,"name"?: string,"other_requirement"?: string | null,"purchase_requirement"?: string | null,"requires_purchase"?: boolean,"retired_at"?: string | null,"reward_description"?: string,"reward_type"?: Database["public"]['Enums']["reward_type"],"signup_lead_days"?: number | null,"source_url"?: string,"state_codes"?: (string)[],"states_scope"?: Database["public"]['Enums']["states_scope"],"store_finder_url"?: string | null,"timing_type"?: Database["public"]['Enums']["timing_type"],"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reward_group_items": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"position": number,"retailer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"position": number,"retailer_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"position"?: number,"retailer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reward_group_items_group_id_user_id_fkey"
      columns: ["group_id","user_id"]
isOneToOne: false
      referencedRelation: "reward_groups"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "reward_group_items_user_id_retailer_id_fkey"
      columns: ["user_id","retailer_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["user_id","retailer_id"]
    }
                  ]
                },"reward_groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"pickup_date": string,"pickup_time": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"pickup_date": string,"pickup_time": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"pickup_date"?: string,"pickup_time"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_welcome_email":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_pickup":
{ Args: { "p_location_label": string,"p_note": string,"p_picked_up_on": string,"p_retailer_id": string }; Returns: string
                           },
"mark_password_set":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"release_welcome_email":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"reorder_group_items":
{ Args: { "p_group_id": string,"p_item_ids": (string)[] }; Returns: undefined
                           },
"retailer_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "popular": number,"total": number
            }[]
                           }
          }
          Enums: {
            "retailer_category": "food_drink"|"entertainment"|"retail"|"beauty","reward_type": "free_item"|"discount"|"bogo"|"points"|"free_with_purchase","states_scope": "all"|"listed"|"unknown","timing_type": "from_birthday"|"birth_month"|"around_birthday"|"month_start"|"to_month_end"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "retailer_category": ["food_drink", "entertainment", "retail", "beauty"],"reward_type": ["free_item", "discount", "bogo", "points", "free_with_purchase"],"states_scope": ["all", "listed", "unknown"],"timing_type": ["from_birthday", "birth_month", "around_birthday", "month_start", "to_month_end"]
          }
        }
} as const
