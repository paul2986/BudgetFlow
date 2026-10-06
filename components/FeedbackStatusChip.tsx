import { ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Chip } from './ui';
import { type FeedbackStatus, statusInfo, statusLabel } from '../utils/feedbackFormat';

/**
 * Where a piece of feedback stands. Always an icon plus a word, never colour
 * alone; the quiet statuses (saved for later, not planned) are an outline.
 * The sender gets the gentler wording, the admin the plain one.
 */

interface FeedbackStatusChipProps {
  status: FeedbackStatus;
  audience: 'admin' | 'sender';
  style?: ViewStyle;
}

export default function FeedbackStatusChip({ status, audience, style }: FeedbackStatusChipProps) {
  const { tokens } = useTheme();
  const { icon, tone } = statusInfo(status);
  const label = statusLabel(status, audience);

  if (tone === 'neutral') return <Chip label={label} icon={icon} outlined style={style} />;
  if (tone === 'brand') {
    return (
      <Chip
        label={label}
        icon={icon}
        color={tokens.colors.onBrandSubtle}
        backgroundColor={tokens.colors.brandSubtle}
        style={style}
      />
    );
  }
  return (
    <Chip
      label={label}
      icon={icon}
      color={tokens.colors[tone]}
      backgroundColor={tokens.colors[`${tone}Subtle` as const]}
      style={style}
    />
  );
}
