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
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount_brl: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          paid_amount: number | null
          paid_at: string | null
          sale_id: string
          status: string
        }
        Insert: {
          amount_brl: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          paid_amount?: number | null
          paid_at?: string | null
          sale_id: string
          status?: string
        }
        Update: {
          amount_brl?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          paid_amount?: number | null
          paid_at?: string | null
          sale_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tests: {
        Row: {
          created_at: string
          id: string
          partner_name: string
          perfume_name: string
          product_id: string
          quantity: number
          test_date: string
          total_cost_brl: number
          unit_cost_brl: number
        }
        Insert: {
          created_at?: string
          id?: string
          partner_name: string
          perfume_name: string
          product_id: string
          quantity: number
          test_date?: string
          total_cost_brl: number
          unit_cost_brl: number
        }
        Update: {
          created_at?: string
          id?: string
          partner_name?: string
          perfume_name?: string
          product_id?: string
          quantity?: number
          test_date?: string
          total_cost_brl?: number
          unit_cost_brl?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          avg_cost_brl: number
          barcode: string | null
          brand: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          stock_qty: number
          suggested_price_brl: number
          updated_at: string
        }
        Insert: {
          avg_cost_brl?: number
          barcode?: string | null
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          stock_qty?: number
          suggested_price_brl?: number
          updated_at?: string
        }
        Update: {
          avg_cost_brl?: number
          barcode?: string | null
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          stock_qty?: number
          suggested_price_brl?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          brand: string | null
          created_at: string
          exchange_rate: number
          expires_at: string | null
          id: string
          perfume_name: string
          product_id: string
          purchase_order_id: string
          quantity: number
          remaining_qty: number
          suggested_price_brl: number
          supplier_fee_pct: number
          total_brl: number
          unit_brl: number
          unit_usd: number
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exchange_rate?: number
          expires_at?: string | null
          id?: string
          perfume_name: string
          product_id: string
          purchase_order_id: string
          quantity: number
          remaining_qty?: number
          suggested_price_brl?: number
          supplier_fee_pct?: number
          total_brl?: number
          unit_brl?: number
          unit_usd?: number
        }
        Update: {
          brand?: string | null
          created_at?: string
          exchange_rate?: number
          expires_at?: string | null
          id?: string
          perfume_name?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          remaining_qty?: number
          suggested_price_brl?: number
          supplier_fee_pct?: number
          total_brl?: number
          unit_brl?: number
          unit_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          country: string | null
          created_at: string
          exchange_rate: number
          id: string
          notes: string | null
          payment_method: string | null
          purchase_date: string
          supplier: string | null
          supplier_fee_pct: number
          total_brl: number
          total_usd: number
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          purchase_date?: string
          supplier?: string | null
          supplier_fee_pct?: number
          total_brl?: number
          total_usd?: number
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          purchase_date?: string
          supplier?: string | null
          supplier_fee_pct?: number
          total_brl?: number
          total_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          brand: string | null
          created_at: string
          exchange_rate: number
          id: string
          perfume_name: string
          product_id: string
          purchase_date: string
          quantity: number
          supplier_fee_pct: number
          total_brl: number
          unit_brl: number
          unit_usd: number
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exchange_rate: number
          id?: string
          perfume_name: string
          product_id: string
          purchase_date?: string
          quantity: number
          supplier_fee_pct?: number
          total_brl: number
          unit_brl: number
          unit_usd: number
        }
        Update: {
          brand?: string | null
          created_at?: string
          exchange_rate?: number
          id?: string
          perfume_name?: string
          product_id?: string
          purchase_date?: string
          quantity?: number
          supplier_fee_pct?: number
          total_brl?: number
          unit_brl?: number
          unit_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cost: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          installments_count: number
          payment_method: string
          payment_status: string
          perfume_name: string
          product_id: string
          profit: number
          quantity: number
          revenue: number
          sale_date: string
          unit_cost_brl: number
          unit_price_brl: number
        }
        Insert: {
          cost: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          installments_count?: number
          payment_method?: string
          payment_status?: string
          perfume_name: string
          product_id: string
          profit: number
          quantity: number
          revenue: number
          sale_date?: string
          unit_cost_brl: number
          unit_price_brl: number
        }
        Update: {
          cost?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          installments_count?: number
          payment_method?: string
          payment_status?: string
          perfume_name?: string
          product_id?: string
          profit?: number
          quantity?: number
          revenue?: number
          sale_date?: string
          unit_cost_brl?: number
          unit_price_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
