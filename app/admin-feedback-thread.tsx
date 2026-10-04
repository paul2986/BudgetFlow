import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import FeedbackThread from '../components/FeedbackThread';
import FeedbackReplyBox from '../components/FeedbackReplyBox';
import { ChoicePills, EmptyState, ListGroup, ListRow, Skeleton } from '../components/ui';
import { AdminFeedback, fetchAdminFeedbackItem, replyAsAdmin, setFeedbackStatus } from '../utils/feedback';
import { FEEDBACK_STATUSES, FeedbackStatus, statusInfo, statusLabel } from '../utils/feedbackFormat';
import { haptics } from '../utils/haptics';
import { type, radius, space } from '../styles/tokens';

/**
 * One feedback item for an admin: who sent it (if they shared that), what it
 * says, where it stands, and the conversation. Changing the status or replying
 * both reach the sender, who sees them in their own thread.
 */

const MAX_WIDTH = 680;

const PLATFORM_NAMES = { ios: 'iPhone or iPad', android: 'Android', web: 'Web' } as const;

const formatSent = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function AdminFeedbackThreadScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { user } = useBudgetData();
  const { isAdmin, checked } = useIsAdmin(user?.id);
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<AdminFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tabs stay mounted: another item's thread may still be in state when this one opens.
  const current = item && item.id === id ? item : null;

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/admin-feedback'));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setItem(await fetchAdminFeedbackItem(id));
      setMissing(false);
      setFailed(false);
    } catch (error) {
      console.error('AdminFeedbackThread: Load error:', error);
      if ((error as { code?: string } | null)?.code === 'P0002') {
        setMissing(true);
      } else {
        setFailed(true);
        showToast('Couldn’t load this feedback. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useFocusEffect(
    useCallback(() => {
      if (!checked) return;
      if (!isAdmin) {
        router.replace('/settings');
        return;
      }
      load();
    }, [checked, isAdmin, load])
  );

  if (checked && !isAdmin) return <View style={themedStyles.container} />;

  const changeStatus = async (status: FeedbackStatus) => {
    if (!current) return;
    setBusy(true);
    try {
      setItem(await setFeedbackStatus(current.id, status));
      showToast(`Marked as ${statusLabel(status, 'admin').toLowerCase()}`, 'success');
    } catch (error) {
      console.error('AdminFeedbackThread: Status error:', error);
      haptics.error();
      showToast('Couldn’t change the status. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reply = async (text: string): Promise<boolean> => {
    if (!current) return false;
    setBusy(true);
    try {
      setItem(await replyAsAdmin(current.id, text));
      haptics.success();
      showToast('Reply sent', 'success');
      return true;
    } catch (error) {
      console.error('AdminFeedbackThread: Reply error:', error);
      haptics.error();
      showToast('Couldn’t send the reply. Please try again.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const renderBody = () => {
    if (!current) {
      if (missing) {
        return (
          <EmptyState
            icon="chatbubble-outline"
            title="Couldn’t find this feedback"
            caption="It may have been removed along with its account."
            actionLabel="Back to feedback"
            onAction={() => router.replace('/admin-feedback')}
          />
        );
      }
      if (failed) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load this feedback"
            caption="Check your connection and try again."
            actionLabel="Try again"
            onAction={load}
          />
        );
      }
      return <Skeleton height={120} borderRadius={radius.lg} />;
    }

    const device = [current.platform ? PLATFORM_NAMES[current.platform] : null, current.app_version].filter(Boolean).join(' · ');

    return (
      <>
        <ListGroup>
          <ListRow
            title={current.sender_email ?? 'Email not shared'}
            caption={current.sender_email ? 'Sender' : 'The sender chose not to share it. You can still reply here.'}
            captionLines={2}
            icon={current.sender_email ? 'mail-outline' : 'eye-off-outline'}
          />
          <ListRow title={formatSent(current.created_at)} caption="Sent" icon="time-outline" showSeparator={!!device} />
          {device ? <ListRow title={device} caption="Device and app version" icon="phone-portrait-outline" showSeparator={false} /> : null}
        </ListGroup>

        <ChoicePills<FeedbackStatus>
          label="Status"
          options={FEEDBACK_STATUSES.map((status) => ({
            value: status,
            label: statusLabel(status, 'admin'),
            icon: statusInfo(status).icon,
          }))}
          value={current.status}
          onChange={changeStatus}
          disabled={busy}
          style={{ marginBottom: space.s6 }}
        />

        <FeedbackThread
          viewer="admin"
          original={current}
          messages={current.messages ?? []}
          senderLabel={current.sender_email ?? 'Sender'}
        />

        <View style={{ marginTop: space.s6 }}>
          <FeedbackReplyBox
            label="Reply"
            placeholder="The sender sees this in the app"
            sendLabel="Send reply"
            sending={busy}
            onSend={reply}
          />
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s3, marginHorizontal: space.s1 }]}>
            Changing the status or replying shows up for the sender the next time they open Feedback.
          </Text>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={themedStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StandardHeader title="Feedback" onLeftPress={goBack} loading={loading && !!current} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && !!current} onRefresh={load} tintColor={tokens.colors.textMuted} />}
      >
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>{renderBody()}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
