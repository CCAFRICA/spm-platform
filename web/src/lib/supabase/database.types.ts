/**
 * Supabase Database Types — ViaLuce Entity Model Schema
 *
 * 23 tables: 17 MDS v2 + 6 entity model (incl. 3 materializations)
 * Domain-agnostic naming throughout: rule_sets NOT compensation_plans,
 * entity_id NOT employee_id.
 *
 * Tables:
 *  1. tenants                    - Multi-tenant container
 *  2. profiles                   - User profiles with capabilities
 *  3. entities                   - Domain-agnostic entity registry
 *  4. entity_relationships       - Relationship graph
 *  5. reassignment_events        - Entity reassignment tracking
 *  6. rule_sets                  - 5-layer decomposition (was compensation_plans)
 *  7. rule_set_assignments       - Entity-to-rule-set binding
 *  8. periods                    - Temporal period management
 *  9. import_batches             - File import metadata
 * 10. committed_data             - Raw transaction data
 * 11. calculation_batches        - Calculation batch with immutability (Rule 30)
 * 12. calculation_results        - Per-entity calculation outcomes
 * 13. calculation_traces         - Formula-level debug traces
 * 14. disputes                   - Entity dispute records
 * 15. reconciliation_sessions    - ADR reconciliation sessions
 * 16. classification_signals     - AI classification feedback
 * 17. audit_logs                 - Audit trail
 * 18. ingestion_configs          - Data ingestion configuration
 * 19. ingestion_events           - Ingestion audit trail
 * 20. usage_metering             - Platform usage tracking
 * 21. period_entity_state        - Materialization: temporal snapshot
 * 22. profile_scope              - Materialization: graph-derived visibility
 * 23. entity_period_outcomes     - Materialization: aggregated outcomes
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EntityType = 'individual' | 'location' | 'team' | 'organization';
export type EntityStatus = 'proposed' | 'active' | 'suspended' | 'terminated';
export type RelationshipType =
  | 'contains'
  | 'manages'
  | 'works_at'
  | 'assigned_to'
  | 'member_of'
  | 'participates_in'
  | 'oversees'
  | 'assists';
export type RelationshipSource =
  | 'ai_inferred'
  | 'human_confirmed'
  | 'human_created'
  | 'imported_explicit';
export type RuleSetStatus = 'draft' | 'pending_approval' | 'active' | 'archived';
export type PeriodType = 'monthly' | 'quarterly' | 'biweekly' | 'weekly' | 'annual';
export type PeriodStatus = 'open' | 'calculating' | 'review' | 'closed' | 'paid';
export type BatchType = 'standard' | 'superseding' | 'adjustment' | 'reversal';
export type LifecycleState =
  | 'DRAFT'
  | 'PREVIEW'
  | 'RECONCILE'
  | 'OFFICIAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'CLOSED'
  | 'PAID'
  | 'PUBLISHED';
export type ScopeType = 'graph_derived' | 'admin_override' | 'platform';
export type Capability =
  | 'view_outcomes'
  | 'approve_outcomes'
  | 'export_results'
  | 'manage_rule_sets'
  | 'manage_assignments'
  | 'design_scenarios'
  | 'manage_tenants'
  | 'manage_profiles'
  | 'import_data'
  | 'view_audit';

export interface Database {
  public: {
    Tables: {
      // ──────────────────────────────────────────────
      // TABLE 1: tenants
      // ──────────────────────────────────────────────
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          settings: Json;
          hierarchy_labels: Json;
          entity_type_labels: Json;
          currency: string;
          locale: string;
          features: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          settings?: Json;
          hierarchy_labels?: Json;
          entity_type_labels?: Json;
          currency?: string;
          locale?: string;
          features?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          settings?: Json;
          hierarchy_labels?: Json;
          entity_type_labels?: Json;
          currency?: string;
          locale?: string;
          features?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 2: profiles
      // ──────────────────────────────────────────────
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          tenant_id: string;
          entity_id: string | null;
          display_name: string;
          email: string;
          role: string;
          capabilities: Capability[];
          locale: string | null;
          avatar_url: string | null;
          scope_override: string | null;
          scope_level: string | null;
          settings: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          tenant_id: string;
          entity_id?: string | null;
          display_name: string;
          email: string;
          role: string;
          capabilities?: Capability[];
          locale?: string | null;
          avatar_url?: string | null;
          scope_override?: string | null;
          scope_level?: string | null;
          settings?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          entity_id?: string | null;
          display_name?: string;
          email?: string;
          role?: string;
          capabilities?: Capability[];
          locale?: string | null;
          avatar_url?: string | null;
          scope_override?: string | null;
          scope_level?: string | null;
          settings?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 3: entities
      // ──────────────────────────────────────────────
      entities: {
        Row: {
          id: string;
          tenant_id: string;
          entity_type: EntityType;
          status: EntityStatus;
          external_id: string | null;
          display_name: string;
          profile_id: string | null;
          temporal_attributes: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_type: EntityType;
          status?: EntityStatus;
          external_id?: string | null;
          display_name: string;
          profile_id?: string | null;
          temporal_attributes?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          entity_type?: EntityType;
          status?: EntityStatus;
          external_id?: string | null;
          display_name?: string;
          profile_id?: string | null;
          temporal_attributes?: Json;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 4: entity_relationships
      // ──────────────────────────────────────────────
      entity_relationships: {
        Row: {
          id: string;
          tenant_id: string;
          source_entity_id: string;
          target_entity_id: string;
          relationship_type: RelationshipType;
          source: RelationshipSource;
          confidence: number;
          evidence: Json;
          context: Json;
          effective_from: string | null;
          effective_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          source_entity_id: string;
          target_entity_id: string;
          relationship_type: RelationshipType;
          source?: RelationshipSource;
          confidence?: number;
          evidence?: Json;
          context?: Json;
          effective_from?: string | null;
          effective_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          relationship_type?: RelationshipType;
          source?: RelationshipSource;
          confidence?: number;
          evidence?: Json;
          context?: Json;
          effective_from?: string | null;
          effective_to?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 5: reassignment_events
      // ──────────────────────────────────────────────
      reassignment_events: {
        Row: {
          id: string;
          tenant_id: string;
          entity_id: string;
          from_entity_id: string | null;
          to_entity_id: string | null;
          effective_date: string;
          credit_model: Json;
          transition_window: Json;
          impact_preview: Json;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_id: string;
          from_entity_id?: string | null;
          to_entity_id?: string | null;
          effective_date: string;
          credit_model?: Json;
          transition_window?: Json;
          impact_preview?: Json;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          credit_model?: Json;
          transition_window?: Json;
          impact_preview?: Json;
          reason?: string | null;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 6: rule_sets (was compensation_plans)
      // ──────────────────────────────────────────────
      rule_sets: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string | null;
          status: RuleSetStatus;
          version: number;
          effective_from: string | null;
          effective_to: string | null;
          population_config: Json;
          input_bindings: Json;
          components: Json;
          cadence_config: Json;
          outcome_config: Json;
          metadata: Json;
          created_by: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          description?: string | null;
          status?: RuleSetStatus;
          version?: number;
          effective_from?: string | null;
          effective_to?: string | null;
          population_config?: Json;
          input_bindings?: Json;
          components?: Json;
          cadence_config?: Json;
          outcome_config?: Json;
          metadata?: Json;
          created_by?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          status?: RuleSetStatus;
          version?: number;
          effective_from?: string | null;
          effective_to?: string | null;
          population_config?: Json;
          input_bindings?: Json;
          components?: Json;
          cadence_config?: Json;
          outcome_config?: Json;
          metadata?: Json;
          approved_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 7: rule_set_assignments
      // ──────────────────────────────────────────────
      rule_set_assignments: {
        Row: {
          id: string;
          tenant_id: string;
          rule_set_id: string;
          entity_id: string;
          effective_from: string | null;
          effective_to: string | null;
          assignment_type: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          rule_set_id: string;
          entity_id: string;
          effective_from?: string | null;
          effective_to?: string | null;
          assignment_type?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          effective_from?: string | null;
          effective_to?: string | null;
          assignment_type?: string;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 8: periods
      // ──────────────────────────────────────────────
      periods: {
        Row: {
          id: string;
          tenant_id: string;
          period_key: string;
          period_type: PeriodType;
          start_date: string;
          end_date: string;
          parent_period_id: string | null;
          payment_date: string | null;
          status: PeriodStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_key: string;
          period_type: PeriodType;
          start_date: string;
          end_date: string;
          parent_period_id?: string | null;
          payment_date?: string | null;
          status?: PeriodStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          period_key?: string;
          period_type?: PeriodType;
          start_date?: string;
          end_date?: string;
          parent_period_id?: string | null;
          payment_date?: string | null;
          status?: PeriodStatus;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 9: import_batches
      // ──────────────────────────────────────────────
      import_batches: {
        Row: {
          id: string;
          tenant_id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          row_count: number;
          classification: Json;
          ai_mappings: Json;
          status: string;
          imported_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          file_name: string;
          file_type?: string;
          file_size?: number;
          row_count?: number;
          classification?: Json;
          ai_mappings?: Json;
          status?: string;
          imported_by: string;
          created_at?: string;
        };
        Update: {
          classification?: Json;
          ai_mappings?: Json;
          status?: string;
          row_count?: number;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 10: committed_data
      // ──────────────────────────────────────────────
      committed_data: {
        Row: {
          id: string;
          tenant_id: string;
          import_batch_id: string;
          entity_id: string;
          entity_type: EntityType;
          period_key: string;
          data_type: string;
          values: Json;
          source_row_index: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          import_batch_id: string;
          entity_id: string;
          entity_type: EntityType;
          period_key: string;
          data_type: string;
          values: Json;
          source_row_index?: number | null;
          created_at?: string;
        };
        Update: {
          values?: Json;
          data_type?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 11: calculation_batches (Rule 30 compliant)
      // ──────────────────────────────────────────────
      calculation_batches: {
        Row: {
          id: string;
          tenant_id: string;
          period_id: string;
          rule_set_id: string;
          batch_type: BatchType;
          lifecycle_state: LifecycleState;
          entity_count: number;
          total_payout: number;
          component_totals: Json;
          superseded_by: string | null;
          supersedes: string | null;
          submitted_by: string | null;
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_id: string;
          rule_set_id: string;
          batch_type?: BatchType;
          lifecycle_state?: LifecycleState;
          entity_count?: number;
          total_payout?: number;
          component_totals?: Json;
          superseded_by?: string | null;
          supersedes?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lifecycle_state?: LifecycleState;
          entity_count?: number;
          total_payout?: number;
          component_totals?: Json;
          superseded_by?: string | null;
          supersedes?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 12: calculation_results
      // ──────────────────────────────────────────────
      calculation_results: {
        Row: {
          id: string;
          tenant_id: string;
          batch_id: string;
          entity_id: string;
          entity_type: EntityType | null;
          assignment_id: string | null;
          variant_key: string | null;
          rule_set_id: string;
          total_outcome: number;
          components: Json;
          metrics: Json;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          batch_id: string;
          entity_id: string;
          entity_type?: EntityType | null;
          assignment_id?: string | null;
          variant_key?: string | null;
          rule_set_id: string;
          total_outcome?: number;
          components?: Json;
          metrics?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          total_outcome?: number;
          components?: Json;
          metrics?: Json;
          metadata?: Json;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 13: calculation_traces
      // ──────────────────────────────────────────────
      calculation_traces: {
        Row: {
          id: string;
          tenant_id: string;
          batch_id: string;
          entity_id: string;
          component_id: string;
          trace_data: Json;
          formula: string | null;
          inputs: Json;
          output: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          batch_id: string;
          entity_id: string;
          component_id: string;
          trace_data?: Json;
          formula?: string | null;
          inputs?: Json;
          output?: number;
          created_at?: string;
        };
        Update: {
          trace_data?: Json;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 14: disputes
      // ──────────────────────────────────────────────
      disputes: {
        Row: {
          id: string;
          tenant_id: string;
          entity_id: string;
          batch_id: string | null;
          period_key: string;
          dispute_type: string;
          description: string;
          amount_disputed: number | null;
          status: string;
          resolution: Json | null;
          submitted_by: string;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_id: string;
          batch_id?: string | null;
          period_key: string;
          dispute_type: string;
          description: string;
          amount_disputed?: number | null;
          status?: string;
          resolution?: Json | null;
          submitted_by: string;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          resolution?: Json | null;
          resolved_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 15: reconciliation_sessions
      // ──────────────────────────────────────────────
      reconciliation_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          batch_id: string;
          period_key: string;
          comparison_file: string | null;
          result_summary: Json;
          depth_assessment: Json;
          false_greens: Json;
          status: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          batch_id: string;
          period_key: string;
          comparison_file?: string | null;
          result_summary?: Json;
          depth_assessment?: Json;
          false_greens?: Json;
          status?: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          result_summary?: Json;
          depth_assessment?: Json;
          false_greens?: Json;
          status?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 16: classification_signals
      // ──────────────────────────────────────────────
      classification_signals: {
        Row: {
          id: string;
          tenant_id: string;
          import_batch_id: string | null;
          field_name: string;
          semantic_type: string;
          confidence: number;
          source: string;
          context: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          import_batch_id?: string | null;
          field_name: string;
          semantic_type: string;
          confidence?: number;
          source?: string;
          context?: Json;
          created_at?: string;
        };
        Update: {
          confidence?: number;
          source?: string;
          context?: Json;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 17: audit_logs
      // ──────────────────────────────────────────────
      audit_logs: {
        Row: {
          id: string;
          tenant_id: string;
          actor_id: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          actor_id: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 18: ingestion_configs
      // ──────────────────────────────────────────────
      ingestion_configs: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          source_type: string;
          connection_config: Json;
          mapping_config: Json;
          schedule: Json | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          source_type: string;
          connection_config?: Json;
          mapping_config?: Json;
          schedule?: Json | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          source_type?: string;
          connection_config?: Json;
          mapping_config?: Json;
          schedule?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 19: ingestion_events
      // ──────────────────────────────────────────────
      ingestion_events: {
        Row: {
          id: string;
          tenant_id: string;
          config_id: string;
          status: string;
          rows_processed: number;
          rows_failed: number;
          error_details: Json | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          config_id: string;
          status?: string;
          rows_processed?: number;
          rows_failed?: number;
          error_details?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: string;
          rows_processed?: number;
          rows_failed?: number;
          error_details?: Json | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 20: usage_metering
      // ──────────────────────────────────────────────
      usage_metering: {
        Row: {
          id: string;
          tenant_id: string;
          metric_name: string;
          metric_value: number;
          period_key: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          metric_name: string;
          metric_value: number;
          period_key: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          metric_value?: number;
          metadata?: Json;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 21: period_entity_state (Materialization D5)
      // ──────────────────────────────────────────────
      period_entity_state: {
        Row: {
          id: string;
          tenant_id: string;
          entity_id: string;
          period_id: string;
          resolved_attributes: Json;
          resolved_relationships: Json;
          entity_type: string;
          status: string;
          materialized_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_id: string;
          period_id: string;
          resolved_attributes?: Json;
          resolved_relationships?: Json;
          entity_type: string;
          status: string;
          materialized_at?: string;
        };
        Update: {
          resolved_attributes?: Json;
          resolved_relationships?: Json;
          entity_type?: string;
          status?: string;
          materialized_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 22: profile_scope (Materialization D6/D7)
      // ──────────────────────────────────────────────
      profile_scope: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string;
          scope_type: ScopeType;
          visible_entity_ids: string[];
          visible_rule_set_ids: string[];
          visible_period_ids: string[];
          metadata: Json;
          materialized_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id: string;
          scope_type?: ScopeType;
          visible_entity_ids?: string[];
          visible_rule_set_ids?: string[];
          visible_period_ids?: string[];
          metadata?: Json;
          materialized_at?: string;
        };
        Update: {
          scope_type?: ScopeType;
          visible_entity_ids?: string[];
          visible_rule_set_ids?: string[];
          visible_period_ids?: string[];
          metadata?: Json;
          materialized_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────────
      // TABLE 23: entity_period_outcomes (Materialization D7)
      // ──────────────────────────────────────────────
      entity_period_outcomes: {
        Row: {
          id: string;
          tenant_id: string;
          entity_id: string;
          period_id: string;
          total_payout: number;
          rule_set_breakdown: Json;
          component_breakdown: Json;
          lowest_lifecycle_state: string;
          attainment_summary: Json;
          metadata: Json;
          materialized_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entity_id: string;
          period_id: string;
          total_payout?: number;
          rule_set_breakdown?: Json;
          component_breakdown?: Json;
          lowest_lifecycle_state?: string;
          attainment_summary?: Json;
          metadata?: Json;
          materialized_at?: string;
        };
        Update: {
          total_payout?: number;
          rule_set_breakdown?: Json;
          component_breakdown?: Json;
          lowest_lifecycle_state?: string;
          attainment_summary?: Json;
          metadata?: Json;
          materialized_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ──────────────────────────────────────────────
// Convenience row type helpers
// ──────────────────────────────────────────────
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Named exports for common types
export type Tenant = Tables<'tenants'>;
export type Profile = Tables<'profiles'>;
export type Entity = Tables<'entities'>;
export type EntityRelationship = Tables<'entity_relationships'>;
export type ReassignmentEvent = Tables<'reassignment_events'>;
export type RuleSet = Tables<'rule_sets'>;
export type RuleSetAssignment = Tables<'rule_set_assignments'>;
export type Period = Tables<'periods'>;
export type ImportBatch = Tables<'import_batches'>;
export type CommittedData = Tables<'committed_data'>;
export type CalculationBatch = Tables<'calculation_batches'>;
export type CalculationResult = Tables<'calculation_results'>;
export type CalculationTrace = Tables<'calculation_traces'>;
export type Dispute = Tables<'disputes'>;
export type ReconciliationSession = Tables<'reconciliation_sessions'>;
export type ClassificationSignal = Tables<'classification_signals'>;
export type AuditLog = Tables<'audit_logs'>;
export type IngestionConfig = Tables<'ingestion_configs'>;
export type IngestionEvent = Tables<'ingestion_events'>;
export type UsageMeter = Tables<'usage_metering'>;
export type PeriodEntityState = Tables<'period_entity_state'>;
export type ProfileScope = Tables<'profile_scope'>;
export type EntityPeriodOutcome = Tables<'entity_period_outcomes'>;
