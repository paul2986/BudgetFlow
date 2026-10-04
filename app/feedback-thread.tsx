import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import FeedbackStatusChip from '../components/FeedbackStatusChip';
import FeedbackThread from '../components/FeedbackThread';
import FeedbackReplyBox from '../components/FeedbackReplyBox';
import { EmptyState, Skeleton } from '../components/ui';
import { MyFeedback, feedbackFailure, fetchMyFeedback, markFeedbackSeen, replyToFeedback } from '../utils/feedback';
import { relativeTime } from '../utils/feedbackFormat';
import { haptics } from '../utils/haptics';
import { type, radius, space } from '../styles/tokens';

/**
 * One of the caller's own feedback items: its status, the conversation so far,
 * and a box to add to it. Opening it marks the developer's replies as read.
 */

const MAX_WIDTH = 680;

export default function FeedbackThreadScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<MyFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [sending, setSending] = useState(false);

  // Tabs stay mounted: another item's thread may still be in state when this one opens.
  const current = item && item.id === id ? item : null;

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/feedback'));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const all = await fetchMyFeedback();
      const found = all.find((f) => f.id === id) ?? null;
      setItem(found);
      setMissing(!found);
      setFailed(false);
      // Reading it is what clears the "new reply" markers; a miss is harmless.
      if (found?.unread) markFeedbackSeen(found.id).catch(() => {});
    } catch (error) {
      console.error('FeedbackThread: Load error:', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reply = async (text: string): Promise<boolean> => {
    if (!current) return false;
    setSending(true);
    try {
      await replyToFeedback(current.id, text);
      haptics.success();
      await load();
      return true;
    } catch (error) {
      console.error('FeedbackThread: Reply error:', error);
      haptics.error();
      showToast(
        feedbackFailure(error) === 'rate-limited'
          ? 'You’ve sent a lot of messages just now. Please try again in a little while.'
          : 'Couldn’t send your message. Check your connection and try again.',
        'error'
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const renderBody = () => {
    if (!current) {
      if (missing) {
        return (
          <EmptyState
            icon="chatbubble-outline"
            title="Couldn’t find this feedback"
            caption="It may have been removed."
            actionLabel="Back to feedback"
            onAction={() => router.replace('/feedback')}
          />
        );
      }
      if (failed) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load this conversation"
            caption="Check your connection and try again."
            actionLabel="Try again"
            onAction={load}
          />
        );
      }
      return <Skeleton height={120} borderRadius={radius.lg} />;
    }

    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s5, marginHorizontal: space.s1 }}>
          <FeedbackStatusChip status={current.status} audience="sender" />
          <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Sent {relativeTime(current.created_at)}</Text>
        </View>

        <FeedbackThread viewer="sender" original={current} messages={current.messages} />

        <View style={{ marginTop: space.s6 }}>
          <FeedbackReplyBox
            label="Add a message"
            placeholder="Reply, or add more detail"
            sendLabel="Send"
            sending={sending}
            onSend={reply}
          />
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
