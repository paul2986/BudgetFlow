import { View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { radius } from '../../styles/tokens';

/**
 * A thin determinate bar for how far along something is. One accessibility
 * element reporting a percentage; the caller prints the real figures as text
 * beside it, since colour alone shouldn't carry the meaning.
 */

interface ProgressBarProps {
  /** 0 to 1. Values outside are clamped. */
  fraction: number;
  /** Fill colour; the brand colour when omitted. */
  color?: string;
  accessibilityLabel: string;
  height?: number;
}

export default function ProgressBar({ fraction, color, accessibilityLabel, height = 6 }: ProgressBarProps) {
  const { tokens } = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const percent = Math.round(clamped * 100);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{
        height,
        borderRadius: radius.full,
        overflow: 'hidden',
        backgroundColor: tokens.colors.surfaceSunken,
      }}
    >
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: radius.full,
          backgroundColor: color ?? tokens.colors.brand,
        }}
      />
    </View>
  );
}
