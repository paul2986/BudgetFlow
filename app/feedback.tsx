import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import Button from '../components/Button';
import Icon from '../components/Icon';
import FeedbackStatusChip from '../components/FeedbackStatusChip';
import { EmptyState, Input, ListGroup, ListRow, Skeleton } from '../components/ui';
import { MyFeedback, feedbackFailure, fetchMyFeedback, submitFeedback } from '../utils/feedback';
import { FEEDBACK_MAX_LENGTH, canSendFeedback, previewText, relativeTime, statusLabel } from '../utils/feedbackFormat';
import { appVersionLabel } from '../utils/appVersion';
import { haptics } from '../utils/haptics';
import { type, radius, space } from '../styles/tokens';

/**
 * Send an idea or suggestion, and see what became of the ones sent before. Opened
 * from Settings. Replies and status changes from the developer show here and in
 * each item's thread.
 */

const MAX_WIDTH = 680;

export default function FeedbackScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();

  const [text, setText] = useState('');
  const [shareEmail, setShareEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState<MyFeedback[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/settings'));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchMyFeedback());
      setFailed(false);
    } catch (error) {
      console.error('Feedback: Load error:', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Tabs stay mounted, so reload each time the screen is shown.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    setSending(true);
    try {
      await submitFeedback(text, shareEmail);
      haptics.success();
      showToast('Thanks, your feedback was sent', 'success');
      setText('');
      load();
    } catch (error) {
      console.error('Feedback: Send error:', error);
      haptics.error();
      const reason = feedbackFailure(error);
      showToast(
        reason === 'rate-limited'
          ? 'You’ve sent a few ideas just now. Please try again in a little while.'
          : reason === 'invalid'
            ? 'That message couldn’t be sent. Check that it isn’t empty or too long.'
            : 'Couldn’t send your feedback. Check your connection and try again.',
        'error'
      );
    } finally {
      setSending(false);
    }
  };

  const length = text.trim().length;
  const over = length > FEEDBACK_MAX_LENGTH;

  const renderSent = () => {
    if (!items) {
      if (failed) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load your feedback"
            caption="Check your connection and try again."
            actionLabel="Try again"
            onAction={load}
          />
        );
      }
      return <Skeleton height={64} borderRadius={radius.lg} />;
    }
    if (items.length === 0) return null;

    return (
      <ListGroup header="Your feedback" style={{ marginTop: space.s6, marginBottom: 0 }}>
        {items.map((item, i) => {
          const replies = item.messages.filter((m) => m.from_admin).length;
          const caption = item.unread
            ? `New reply · ${relativeTime(item.updated_at)}`
            : `${replies > 0 ? `${replies} ${replies === 1 ? 'reply' : 'replies'} · ` : ''}${relativeTime(item.created_at)}`;
          return (
            <ListRow
              key={item.id}
              title={previewText(item.body, 70)}
              caption={caption}
              icon={item.unread ? 'chatbubble-ellipses' : 'chatbubble-outline'}
              iconColor={item.unread ? tokens.colors.brand : undefined}
              chevron
              onPress={() => router.push({ pathname: '/feedback-thread', params: { id: item.id } })}
              accessibilityLabel={`${previewText(item.body, 70)}. ${statusLabel(item.status, 'sender')}. ${caption}`}
              showSeparator={i < items.length - 1}
            >
              {/* Under the text, not beside it: the idea is what the row is about, so it gets the width. */}
              <FeedbackStatusChip status={item.status} audience="sender" style={{ marginTop: space.s2 }} />
            </ListRow>
          );
        })}
      </ListGroup>
    );
  };

  return (
    <KeyboardAvoidingView style={themedStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StandardHeader title="Feedback" onLeftPress={goBack} loading={loading && !!items} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && !!items} onRefresh={load} tintColor={tokens.colors.textMuted} />}
      >
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
          <Text style={[type.body, { color: tokens.colors.textMuted, marginBottom: space.s4, marginHorizontal: space.s1 }]}>
            Got an idea or a suggestion for Budget Flow? Send it here. Replies and status updates show up on this screen.
          </Text>

          <Input
            label="Your idea or suggestion"
            value={text}
            onChangeText={setText}
            placeholder="What would you like to see?"
            multiline
            numberOfLines={5}
            editable={!sending}
            inputStyle={{ minHeight: 120, textAlignVertical: 'top' }}
            error={over ? `That’s ${length - FEEDBACK_MAX_LENGTH} characters too long.` : undefined}
            helperText={length >= FEEDBACK_MAX_LENGTH * 0.9 && !over ? `${length} / ${FEEDBACK_MAX_LENGTH}` : undefined}
          />

          <ListGroup
            style={{ marginTop: space.s4, marginBottom: space.s4 }}
            footer={`Sent with your app version and device type: ${appVersionLabel ? `${appVersionLabel}, ` : ''}${Platform.OS}. Never your budgets.`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s4, paddingVertical: space.s3 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.full,
                  backgroundColor: tokens.colors.surfaceSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: space.s3,
                }}
              >
                <Icon name="mail-outline" size={18} color={tokens.colors.textMuted} />
              </View>
              <View style={{ flex: 1, marginRight: space.s3 }}>
                <Text style={[type.bodyMed, { color: tokens.colors.text }]}>Share my email with the developer</Text>
                <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]}>
                  Off by default: your email isn’t shown to the developer, and you’ll still see replies here.
                </Text>
              </View>
              <Switch
                value={shareEmail}
                onValueChange={setShareEmail}
                disabled={sending}
                accessibilityLabel="Share my email with the developer"
                trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.brand }}
                thumbColor={tokens.colors.switchThumb}
                // @ts-ignore web-only prop on react-native-web's Switch
                activeThumbColor={tokens.colors.switchThumb}
              />
            </View>
          </ListGroup>

          <Button text="Send feedback" onPress={send} disabled={!canSendFeedback(text)} loading={sending} />

          {renderSent()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
