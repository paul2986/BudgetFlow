import { Platform } from 'react-native';
import { supabase } from './supabase';
import { appVersionLabel } from './appVersion';
import type { FeedbackStatus } from './feedbackFormat';

/**
 * Feedback, both sides. Everything goes through database functions
 * (supabase/migrations/*_feedback.sql): a sender only ever reaches their own
 * items, and the admin functions check admin on every call. Nothing here reads
 * a table.
 */

export interface FeedbackMessage {
  id: string;
  from_admin: boolean;
  body: string;
  created_at: string;
}

/** A sender's own item. */
export interface MyFeedback {
  id: string;
  body: string;
  status: FeedbackStatus;
  share_email: boolean;
  created_at: string;
  updated_at: string;
  /** An admin has replied or changed the status since they last looked. */
  unread: boolean;
  messages: FeedbackMessage[];
}

/** An item as an admin sees it. The email is there only when the sender shared it. */
export interface AdminFeedback {
  id: string;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  /** The sender has written since an admin last replied or set a status. */
  needs_you: boolean;
  message_count: number;
  app_version: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  sender_email: string | null;
  /** Only on a single item, not in the list. */
  messages?: FeedbackMessage[];
}

export interface AdminFeedbackCounts {
  total: number;
  needs_you: number;
  new: number;
  backlog: number;
  planned: number;
  done: number;
  rejected: number;
}

/** What went wrong, in terms the screen can word kindly. */
export type FeedbackFailure = 'rate-limited' | 'invalid' | 'failed';

export const feedbackFailure = (error: unknown): FeedbackFailure => {
  const code = (error as { code?: string } | null)?.code;
  if (code === '54000') return 'rate-limited';
  if (code === '22023') return 'invalid';
  return 'failed';
};

const run = async <T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
};

// ---------------------------------------------------------------------------
// The sender's side
// ---------------------------------------------------------------------------

export const submitFeedback = (body: string, shareEmail: boolean): Promise<string> =>
  run<string>(
    supabase.rpc('submit_feedback', {
      p_body: body.trim(),
      p_share_email: shareEmail,
      p_app_version: appVersionLabel || null,
      p_platform: Platform.OS,
    })
  );

export const fetchMyFeedback = (): Promise<MyFeedback[]> => run<MyFeedback[]>(supabase.rpc('my_feedback'));

export const fetchMyFeedbackUnread = (): Promise<number> => run<number>(supabase.rpc('my_feedback_unread'));

export const markFeedbackSeen = (feedbackId: string): Promise<void> =>
  run<void>(supabase.rpc('mark_feedback_seen', { p_feedback_id: feedbackId }));

export const replyToFeedback = (feedbackId: string, body: string): Promise<string> =>
  run<string>(supabase.rpc('reply_to_feedback', { p_feedback_id: feedbackId, p_body: body.trim() }));

// ---------------------------------------------------------------------------
// The admin's side
// ---------------------------------------------------------------------------

export const fetchAdminFeedback = (filter: { status?: FeedbackStatus; needsYou?: boolean } = {}): Promise<AdminFeedback[]> =>
  run<AdminFeedback[]>(
    supabase.rpc('admin_feedback_list', { p_status: filter.status ?? null, p_needs_you: filter.needsYou ?? false })
  );

export const fetchAdminFeedbackItem = (id: string): Promise<AdminFeedback> =>
  run<AdminFeedback>(supabase.rpc('admin_feedback_get', { p_id: id }));

/** Reply, and optionally set the status in the same step. Returns the item with its thread. */
export const replyAsAdmin = (id: string, body: string, status?: FeedbackStatus): Promise<AdminFeedback> =>
  run<AdminFeedback>(supabase.rpc('admin_feedback_reply', { p_id: id, p_body: body.trim(), p_status: status ?? null }));

export const setFeedbackStatus = (id: string, status: FeedbackStatus): Promise<AdminFeedback> =>
  run<AdminFeedback>(supabase.rpc('admin_feedback_set_status', { p_id: id, p_status: status }));

export const fetchAdminFeedbackCounts = (): Promise<AdminFeedbackCounts> =>
  run<AdminFeedbackCounts>(supabase.rpc('admin_feedback_counts'));
