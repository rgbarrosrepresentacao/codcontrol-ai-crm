import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// createBrowserClient stores auth in cookies (not localStorage)
// This lets the server-side middleware read the session on every request
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string | null
          email: string | null
          plan_id: string | null
          plan_expires_at: string | null
          is_admin: boolean
          is_active: boolean
          openai_api_key: string | null
          messages_used: number
          created_at: string
          updated_at: string
        }
      }
      plans: {
        Row: {
          id: string
          name: string
          slug: string
          price: number
          max_whatsapp: number
          max_messages: number
          features: string[]
          is_active: boolean
          created_at: string
        }
      }
      whatsapp_instances: {
        Row: {
          id: string
          user_id: string
          instance_name: string
          display_name: string | null
          status: 'connected' | 'disconnected' | 'qr_code' | 'connecting'
          phone_number: string | null
          webhook_configured: boolean
          messages_received: number
          messages_sent: number
          created_at: string
          updated_at: string
        }
      }
      ai_configurations: {
        Row: {
          id: string
          user_id: string
          instance_id: string | null
          bot_name: string
          system_prompt: string
          tone: 'professional' | 'friendly' | 'casual' | 'formal'
          language: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      contacts: {
        Row: {
          id: string
          user_id: string
          instance_id: string | null
          whatsapp_id: string
          phone: string | null
          name: string | null
          push_name: string | null
          profile_picture: string | null
          tags: string[]
          notes: string | null
          status: 'new' | 'active' | 'lead' | 'customer' | 'inactive'
          last_message_at: string | null
          created_at: string
          updated_at: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          instance_id: string | null
          contact_id: string | null
          status: 'open' | 'closed' | 'pending'
          unread_count: number
          last_message: string | null
          last_message_at: string | null
          created_at: string
          updated_at: string
        }
      }
      messages: {
        Row: {
          id: string
          user_id: string
          conversation_id: string | null
          instance_id: string | null
          contact_id: string | null
          message_id: string | null
          from_me: boolean
          content: string | null
          type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker'
          ai_generated: boolean
          status: 'sent' | 'delivered' | 'read' | 'failed'
          created_at: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string | null
          status: 'active' | 'cancelled' | 'expired' | 'trial'
          payment_method: string | null
          payment_id: string | null
          amount: number | null
          started_at: string
          expires_at: string | null
          created_at: string
        }
      }
    }
  }
}
