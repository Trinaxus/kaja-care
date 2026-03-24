export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PreferenceLevel = 'very_happy' | 'nice' | 'neutral' | 'rather_not' | 'impossible';
export type EventType = 'vet' | 'training' | 'medication' | 'special' | 'visit' | 'other';
export type NoteType = 'health' | 'behavior' | 'food' | 'activity' | 'medication' | 'general';
export type VisitType = 'walk' | 'short_stay' | 'vet_visit' | 'grooming' | 'playtime' | 'other';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          color: string
          email: string | null
          preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          color: string
          email?: string | null
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
          email?: string | null
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
      }
      care_assignments: {
        Row: {
          id: string
          date: string
          caretaker_id: string
          status: 'planned' | 'requested' | 'tentative'
          created_by: string
          preference_score: number
          created_at: string
          updated_at: string
          start_time: string | null
          end_time: string | null
          is_full_day: boolean
          notes: string | null
        }
        Insert: {
          id?: string
          date: string
          caretaker_id: string
          status?: 'planned' | 'requested' | 'tentative'
          created_by: string
          preference_score?: number
          created_at?: string
          updated_at?: string
          start_time?: string | null
          end_time?: string | null
          is_full_day?: boolean
          notes?: string | null
        }
        Update: {
          id?: string
          date?: string
          caretaker_id?: string
          status?: 'planned' | 'requested' | 'tentative'
          created_by?: string
          preference_score?: number
          created_at?: string
          updated_at?: string
          start_time?: string | null
          end_time?: string | null
          is_full_day?: boolean
          notes?: string | null
        }
      }
      availability: {
        Row: {
          id: string
          user_id: string
          date: string
          type: 'available' | 'preferred' | 'unavailable'
          reason: string | null
          created_at: string
          start_time: string | null
          end_time: string | null
          is_full_day: boolean
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          type: 'available' | 'preferred' | 'unavailable'
          reason?: string | null
          created_at?: string
          start_time?: string | null
          end_time?: string | null
          is_full_day?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          type?: 'available' | 'preferred' | 'unavailable'
          reason?: string | null
          created_at?: string
          start_time?: string | null
          end_time?: string | null
          is_full_day?: boolean
        }
      }
      handovers: {
        Row: {
          id: string
          date: string
          from_user_id: string
          to_user_id: string
          brings_user_id: string | null
          picks_up_user_id: string | null
          time: string | null
          location: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          from_user_id: string
          to_user_id: string
          brings_user_id?: string | null
          picks_up_user_id?: string | null
          time?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          from_user_id?: string
          to_user_id?: string
          brings_user_id?: string | null
          picks_up_user_id?: string | null
          time?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      requests: {
        Row: {
          id: string
          from_user_id: string
          to_user_id: string
          start_date: string
          end_date: string
          status: 'pending' | 'accepted' | 'declined'
          message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_user_id: string
          to_user_id: string
          start_date: string
          end_date: string
          status?: 'pending' | 'accepted' | 'declined'
          message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_user_id?: string
          to_user_id?: string
          start_date?: string
          end_date?: string
          status?: 'pending' | 'accepted' | 'declined'
          message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      care_day_preferences: {
        Row: {
          id: string
          profile_id: string
          date: string
          preference_level: PreferenceLevel
          reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          date: string
          preference_level: PreferenceLevel
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          date?: string
          preference_level?: PreferenceLevel
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      care_day_events: {
        Row: {
          id: string
          date: string
          event_type: EventType
          title: string
          time: string | null
          location: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          event_type: EventType
          title: string
          time?: string | null
          location?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          event_type?: EventType
          title?: string
          time?: string | null
          location?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      care_day_notes: {
        Row: {
          id: string
          date: string
          caretaker_id: string
          note_type: NoteType
          content: string
          is_important: boolean
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          caretaker_id: string
          note_type: NoteType
          content: string
          is_important?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          caretaker_id?: string
          note_type?: NoteType
          content?: string
          is_important?: boolean
          created_at?: string
        }
      }
      handover_details: {
        Row: {
          id: string
          handover_id: string
          transport_notes: string | null
          items_to_bring: string | null
          special_instructions: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          handover_id: string
          transport_notes?: string | null
          items_to_bring?: string | null
          special_instructions?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          handover_id?: string
          transport_notes?: string | null
          items_to_bring?: string | null
          special_instructions?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      activity_log: {
        Row: {
          id: string
          activity_type: string
          description: string
          related_date: string | null
          actor_id: string | null
          created_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          activity_type: string
          description: string
          related_date?: string | null
          actor_id?: string | null
          created_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          activity_type?: string
          description?: string
          related_date?: string | null
          actor_id?: string | null
          created_at?: string
          metadata?: Json
        }
      }
      messages: {
        Row: {
          id: string
          from_profile_id: string
          to_profile_id: string
          subject: string
          content: string
          is_read: boolean
          parent_message_id: string | null
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          from_profile_id: string
          to_profile_id: string
          subject: string
          content: string
          is_read?: boolean
          parent_message_id?: string | null
          created_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          from_profile_id?: string
          to_profile_id?: string
          subject?: string
          content?: string
          is_read?: boolean
          parent_message_id?: string | null
          created_at?: string
          read_at?: string | null
        }
      }
      expenses: {
        Row: {
          id: string
          profile_id: string
          amount: number
          category: 'food' | 'toys' | 'vet' | 'grooming' | 'accessories' | 'other'
          description: string | null
          date: string
          receipt_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          amount: number
          category: 'food' | 'toys' | 'vet' | 'grooming' | 'accessories' | 'other'
          description?: string | null
          date?: string
          receipt_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          amount?: number
          category?: 'food' | 'toys' | 'vet' | 'grooming' | 'accessories' | 'other'
          description?: string | null
          date?: string
          receipt_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      short_visits: {
        Row: {
          id: string
          date: string
          visitor_id: string
          visit_type: VisitType
          start_time: string
          end_time: string | null
          duration_minutes: number | null
          notes: string | null
          picked_up_from: string | null
          returned_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          visitor_id: string
          visit_type?: VisitType
          start_time: string
          end_time?: string | null
          duration_minutes?: number | null
          notes?: string | null
          picked_up_from?: string | null
          returned_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          visitor_id?: string
          visit_type?: VisitType
          start_time?: string
          end_time?: string | null
          duration_minutes?: number | null
          notes?: string | null
          picked_up_from?: string | null
          returned_to?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type CareAssignment = Database['public']['Tables']['care_assignments']['Row'];
export type Availability = Database['public']['Tables']['availability']['Row'];
export type Handover = Database['public']['Tables']['handovers']['Row'];
export type Request = Database['public']['Tables']['requests']['Row'];
export type CareDayPreference = Database['public']['Tables']['care_day_preferences']['Row'];
export type CareDayEvent = Database['public']['Tables']['care_day_events']['Row'];
export type CareDayNote = Database['public']['Tables']['care_day_notes']['Row'];
export type HandoverDetail = Database['public']['Tables']['handover_details']['Row'];
export type ActivityLog = Database['public']['Tables']['activity_log']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type ShortVisit = Database['public']['Tables']['short_visits']['Row'];
