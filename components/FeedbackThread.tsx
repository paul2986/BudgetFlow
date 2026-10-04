import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { FeedbackMessage } from '../utils/feedback';
import { relativeTime } from '../utils/feedbackFormat';
import { type, radius, space, elevation } from '../styles/tokens';

/**
 * A feedback conversation: the first message, then the replies in order. The
 * viewer's own messages sit on the right, tinted; the other side's on the left.
 */

interface FeedbackThreadProps {
  /** Whose screen this is: a sender sees their own words as "You", an admin sees theirs. */
  viewer: 'sender' | 'admin';
  /** The sender's first message. */
  original: { body: string; created_at: string };
  messages: FeedbackMessage[];
  /** What the admin's screen calls the sender (their email, if they shared it). */
  senderLabel?: string;
}

interface Bubble {
  key: string;
  fromAdmin: boolean;
  body: string;
  created_at: string;
}

export default function FeedbackThread({ viewer, original, messages, senderLabel = 'Sender' }: FeedbackThreadProps) {
  const { tokens } = useTheme();

  const bubbles: Bubble[] = [
    { key: 'original', fromAdmin: false, body: original.body, created_at: original.created_at },
    ...messages.map((m) => ({ key: m.id, fromAdmin: m.from_admin, body: m.body, created_at: m.created_at })),
  ];

  return (
    <View style={{ gap: space.s4 }}>
      {bubbles.map((bubble) => {
        const mine = viewer === 'admin' ? bubble.fromAdmin : !bubble.fromAdmin;
        const who = mine ? 'You' : viewer === 'sender' ? 'Budget Flow' : senderLabel;
        const when = relativeTime(bubble.created_at);
        return (
          <View
            key={bubble.key}
            accessible
            accessibilityLabel={`${who}, ${when}. ${bubble.body}`}
            style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
          >
            <View
              style={{
                maxWidth: '88%',
                paddingHorizontal: space.s4,
                paddingVertical: space.s3,
                borderRadius: radius.lg,
                backgroundColor: mine ? tokens.colors.brandSubtle : tokens.colors.surface,
                ...(mine || tokens.isDark ? null : elevation.e1),
              }}
            >
              <Text selectable style={[type.body, { color: mine ? tokens.colors.onBrandSubtle : tokens.colors.text }]}>
                {bubble.body}
              </Text>
            </View>
            <Text
              style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1, marginHorizontal: space.s2, maxWidth: '88%' }]}
              numberOfLines={1}
            >
              {who} · {when}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
