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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      archive_batches: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          drive_folder_url: string | null
          from_date: string
          id: string
          label: string
          rows_archived: Json
          rows_deleted: Json
          spreadsheet_url: string | null
          status: string
          to_date: string
          totals_verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          drive_folder_url?: string | null
          from_date: string
          id?: string
          label: string
          rows_archived?: Json
          rows_deleted?: Json
          spreadsheet_url?: string | null
          status?: string
          to_date: string
          totals_verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          drive_folder_url?: string | null
          from_date?: string
          id?: string
          label?: string
          rows_archived?: Json
          rows_deleted?: Json
          spreadsheet_url?: string | null
          status?: string
          to_date?: string
          totals_verified_at?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          created_by: string
          daily_salary: number | null
          description: string | null
          discount_amount: number | null
          discount_reason: string | null
          extra_amount: number | null
          extra_reason: string | null
          has_extra: boolean
          hourly_rate: number
          hours_worked: number
          id: string
          is_paid: boolean
          payment_id: string | null
          updated_at: string
          work_date: string
          worker_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          daily_salary?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          extra_amount?: number | null
          extra_reason?: string | null
          has_extra?: boolean
          hourly_rate: number
          hours_worked: number
          id?: string
          is_paid?: boolean
          payment_id?: string | null
          updated_at?: string
          work_date: string
          worker_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          daily_salary?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          extra_amount?: number | null
          extra_reason?: string | null
          has_extra?: boolean
          hourly_rate?: number
          hours_worked?: number
          id?: string
          is_paid?: boolean
          payment_id?: string | null
          updated_at?: string
          work_date?: string
          worker_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      co_admin_member_assignments: {
        Row: {
          assigned_by: string | null
          co_admin_user_id: string
          created_at: string
          id: string
          member_user_id: string
        }
        Insert: {
          assigned_by?: string | null
          co_admin_user_id: string
          created_at?: string
          id?: string
          member_user_id: string
        }
        Update: {
          assigned_by?: string | null
          co_admin_user_id?: string
          created_at?: string
          id?: string
          member_user_id?: string
        }
        Relationships: []
      }
      contractor_archive_summaries: {
        Row: {
          batch_id: string
          contractor_id: string
          contractor_name: string
          created_at: string
          id: string
          total_advances: number
          total_budget: number
          total_materials: number
          total_purchases: number
        }
        Insert: {
          batch_id: string
          contractor_id: string
          contractor_name: string
          created_at?: string
          id?: string
          total_advances?: number
          total_budget?: number
          total_materials?: number
          total_purchases?: number
        }
        Update: {
          batch_id?: string
          contractor_id?: string
          contractor_name?: string
          created_at?: string
          id?: string
          total_advances?: number
          total_budget?: number
          total_materials?: number
          total_purchases?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_archive_summaries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "archive_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_budget_purchases: {
        Row: {
          amount: number
          contractor_payment_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          payment_id: string | null
          purchase_date: string
          receipt_file_name: string | null
          receipt_file_path: string | null
        }
        Insert: {
          amount: number
          contractor_payment_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          payment_id?: string | null
          purchase_date: string
          receipt_file_name?: string | null
          receipt_file_path?: string | null
        }
        Update: {
          amount?: number
          contractor_payment_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          payment_id?: string | null
          purchase_date?: string
          receipt_file_name?: string | null
          receipt_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_budget_purchases_contractor_payment_id_fkey"
            columns: ["contractor_payment_id"]
            isOneToOne: false
            referencedRelation: "contractor_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_payments: {
        Row: {
          amount: number
          contract_id: string | null
          contractor_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          payment_date: string
          payment_id: string | null
          payment_type: string
          workshop_id: string | null
        }
        Insert: {
          amount: number
          contract_id?: string | null
          contractor_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          payment_date: string
          payment_id?: string | null
          payment_type?: string
          workshop_id?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          payment_date?: string
          payment_id?: string | null
          payment_type?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_payments_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_payments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          specialty: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          specialty?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          specialty?: string
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          contractor_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          status: string
          total_amount: number | null
          updated_at: string
          workshop_id: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          workshop_id: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          debt_id: string
          description: string | null
          id: string
          payment_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          debt_id: string
          description?: string | null
          id?: string
          payment_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          debt_id?: string
          description?: string | null
          id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          debt_date: string
          debt_type: string
          description: string | null
          id: string
          is_settled: boolean
          person_name: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          debt_date: string
          debt_type: string
          description?: string | null
          id?: string
          is_settled?: boolean
          person_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          debt_date?: string
          debt_type?: string
          description?: string | null
          id?: string
          is_settled?: boolean
          person_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      finished_workshop_archives: {
        Row: {
          archived_at: string
          archived_by: string
          backup_verified: boolean
          deleted_at: string | null
          deleted_from_database: boolean
          drive_folder_url: string | null
          final_balances: Json
          final_totals: Json
          id: string
          spreadsheet_urls: Json
          workshop_id: string
          workshop_name: string
        }
        Insert: {
          archived_at?: string
          archived_by: string
          backup_verified?: boolean
          deleted_at?: string | null
          deleted_from_database?: boolean
          drive_folder_url?: string | null
          final_balances?: Json
          final_totals?: Json
          id?: string
          spreadsheet_urls?: Json
          workshop_id: string
          workshop_name: string
        }
        Update: {
          archived_at?: string
          archived_by?: string
          backup_verified?: boolean
          deleted_at?: string | null
          deleted_from_database?: boolean
          drive_folder_url?: string | null
          final_balances?: Json
          final_totals?: Json
          id?: string
          spreadsheet_urls?: Json
          workshop_id?: string
          workshop_name?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string
          holiday_date: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          holiday_date: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          holiday_date?: string
          id?: string
        }
        Relationships: []
      }
      income: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          income_date: string
          updated_at: string
          workshop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          income_date: string
          updated_at?: string
          workshop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          income_date?: string
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          paid_to: string
          payment_date: string
          payment_type: string
          reason: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          workshop_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          paid_to: string
          payment_date: string
          payment_type?: string
          reason: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          workshop_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          paid_to?: string
          payment_date?: string
          payment_type?: string
          reason?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          paid_to: string
          payment_date: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          paid_to: string
          payment_date: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          paid_to?: string
          payment_date?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          transfer_date: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          transfer_date: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          transfer_date?: string
          user_id?: string
        }
        Relationships: []
      }
      user_balance_archive_summaries: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          personal_spent: number
          received: number
          user_id: string
          workshop_spent: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          personal_spent?: number
          received?: number
          user_id: string
          workshop_spent?: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          personal_spent?: number
          received?: number
          user_id?: string
          workshop_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_balance_archive_summaries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "archive_batches"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          payment_id: string | null
          transfer_date: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          payment_id?: string | null
          transfer_date: string
          user_id: string
          workshop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          payment_id?: string | null
          transfer_date?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_transfers_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_transfers_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          created_at: string
          created_by: string
          id: string
          is_paid: boolean
          payment_id: string | null
          reason: string | null
          updated_at: string
          work_date: string
          worker_id: string
          workshop_id: string
        }
        Insert: {
          adjustment_type: string
          amount: number
          created_at?: string
          created_by: string
          id?: string
          is_paid?: boolean
          payment_id?: string | null
          reason?: string | null
          updated_at?: string
          work_date: string
          worker_id: string
          workshop_id: string
        }
        Update: {
          adjustment_type?: string
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          is_paid?: boolean
          payment_id?: string | null
          reason?: string | null
          updated_at?: string
          work_date?: string
          worker_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_adjustments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_adjustments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_adjustments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_archive_summaries: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          total_adjustments: number
          total_discounts: number
          total_extra: number
          total_hours: number
          total_salary: number
          worker_id: string
          worker_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          total_adjustments?: number
          total_discounts?: number
          total_extra?: number
          total_hours?: number
          total_salary?: number
          worker_id: string
          worker_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          total_adjustments?: number
          total_discounts?: number
          total_extra?: number
          total_hours?: number
          total_salary?: number
          worker_id?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_archive_summaries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "archive_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          category: string
          created_at: string
          created_by: string
          hourly_rate: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workshop_archive_summaries: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          net_total: number
          total_approved_payments: number
          total_contractor_advances: number
          total_contractor_materials: number
          total_debt_payments: number
          total_debts: number
          total_expenses: number
          total_income: number
          total_transfers: number
          total_worker_hours: number
          total_worker_salaries: number
          workshop_id: string
          workshop_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          net_total?: number
          total_approved_payments?: number
          total_contractor_advances?: number
          total_contractor_materials?: number
          total_debt_payments?: number
          total_debts?: number
          total_expenses?: number
          total_income?: number
          total_transfers?: number
          total_worker_hours?: number
          total_worker_salaries?: number
          workshop_id: string
          workshop_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          net_total?: number
          total_approved_payments?: number
          total_contractor_advances?: number
          total_contractor_materials?: number
          total_debt_payments?: number
          total_debts?: number
          total_expenses?: number
          total_income?: number
          total_transfers?: number
          total_worker_hours?: number
          total_worker_salaries?: number
          workshop_id?: string
          workshop_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_archive_summaries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "archive_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          user_id: string
          workshop_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_assignments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          income_id: string | null
          payment_id: string | null
          uploaded_by: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          income_id?: string | null
          payment_id?: string | null
          uploaded_by: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          income_id?: string | null
          payment_id?: string | null
          uploaded_by?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_files_income_id_fkey"
            columns: ["income_id"]
            isOneToOne: false
            referencedRelation: "income"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_files_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_files_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_payees: {
        Args: never
        Returns: {
          paid_to: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_worker_daily_attendance_summary: {
        Args: { _work_date: string }
        Returns: {
          hidden_hours: number
          total_hours: number
          visible_entries: Json
          worker_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_worker_debt_repayment: {
        Args: {
          _amount: number
          _debt_id: string
          _description: string
          _payment_date: string
          _repayment_mode: string
          _worker_id?: string
          _workshop_id?: string
        }
        Returns: Json
      }
      user_has_workshop_access: {
        Args: { _user_id: string; _workshop_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "co_admin"
      payment_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "user", "co_admin"],
      payment_status: ["pending", "approved", "rejected"],
    },
  },
} as const
