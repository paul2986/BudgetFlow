import { supabase } from './supabase';

/**
 * The admin panel's numbers. They come from `admin_overview()`, which answers
 * only for admins and returns counts and timestamps, never budget content.
 */

export type ExpenseFrequencyKey = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time' | 'other';

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    confirmed: number;
    unconfirmed: number;
    signups_7d: number;
    signups_30d: number;
    active_editors_7d: number;
    active_editors_30d: number;
  };
  budgets: {
    total: number;
    solo: number;
    shared: number;
    avg_members: number;
    created_7d: number;
    created_30d: number;
    edited_7d: number;
    edited_30d: number;
    dormant_30d: number;
    invites_pending: number;
    invites_accepted: number;
    invites_expired: number;
  };
  content: {
    expenses: number;
    people: number;
    median_expenses_per_budget: number;
    max_expenses_per_budget: number;
    expenses_by_frequency: Partial<Record<ExpenseFrequencyKey, number>>;
  };
  health: {
    largest_budget_bytes: number;
    legacy_user_data_with_budgets: number;
    budgets_without_owner: number;
  };
}

/** Whether the signed-in account is an admin. Throws if the server can't say. */
export const fetchIsAdmin = async (): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
};

export const fetchAdminOverview = async (): Promise<AdminOverview> => {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return data as AdminOverview;
};
