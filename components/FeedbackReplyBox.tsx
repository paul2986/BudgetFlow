import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Button from './Button';
import { Input } from './ui';
import { FEEDBACK_MAX_LENGTH, canSendFeedback } from '../utils/feedbackFormat';
import { type, space } from '../styles/tokens';

/**
 * The reply field under a thread: a few lines of text and one button. The
 * parent does the sending and says whether it worked; the text is cleared only
 * when it did, so a failed send never loses what was typed.
 */

interface FeedbackReplyBoxProps {
  label: string;
  placeholder?: string;
  sendLabel: string;
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
}

/** Only show the count when it is getting close, so it isn't noise on a short reply. */
const COUNTER_FROM = Math.floor(FEEDBACK_MAX_LENGTH * 0.9);

export default function FeedbackReplyBox({ label, placeholder, sendLabel, sending, onSend }: FeedbackReplyBoxProps) {
  const { tokens } = useTheme();
  const [text, setText] = useState('');
  const length = text.trim().length;
  const over = length > FEEDBACK_MAX_LENGTH;

  const send = async () => {
    if (await onSend(text)) setText('');
  };

  return (
    <View style={{ gap: space.s3 }}>
      <Input
        label={label}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        multiline
        numberOfLines={4}
        editable={!sending}
        inputStyle={{ minHeight: 96, textAlignVertical: 'top' }}
        error={over ? `That’s ${length - FEEDBACK_MAX_LENGTH} characters too long.` : undefined}
      />
      {length >= COUNTER_FROM && !over ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'right' }]}>
          {length} / {FEEDBACK_MAX_LENGTH}
        </Text>
      ) : null}
      <Button text={sendLabel} onPress={send} disabled={!canSendFeedback(text)} loading={sending} />
    </View>
  );
}
