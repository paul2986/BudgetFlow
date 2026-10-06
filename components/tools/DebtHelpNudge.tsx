import { View, Text } from 'react-native';
import Button from '../Button';
import Icon from '../Icon';
import { Card } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { nudgeMessage, type DebtHelpSignal } from '../../utils/debtHelpNudge';
import { type, space, radius } from '../../styles/tokens';

/**
 * A quiet offer of free debt advice, shown where the budget suggests money may be
 * stretched. Calm on purpose: a neutral icon chip and plain words, not a warning
 * colour, and "Not now" is as easy to reach as the offer (see useDebtHelpNudge).
 */

interface DebtHelpNudgeProps {
  signal: DebtHelpSignal;
  onOpen: () => void;
  onDismiss: () => void;
}

export default function DebtHelpNudge({ signal, onOpen, onDismiss }: DebtHelpNudgeProps) {
  const { tokens } = useTheme();

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.full,
            backgroundColor: tokens.colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="help-buoy-outline" size={22} color={tokens.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text }]}>
            Money feeling tight?
          </Text>
          <Text style={[type.body, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>{nudgeMessage(signal)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s3 }}>
        <Button
          variant="outline"
          text="See free debt help"
          onPress={onOpen}
          style={{ width: 'auto', flexGrow: 1, flexBasis: 176, marginTop: 0, paddingHorizontal: space.s4 }}
        />
        <Button
          variant="ghost"
          text="Not now"
          onPress={onDismiss}
          style={{ width: 'auto', flexGrow: 1, flexBasis: 92, marginTop: 0, paddingHorizontal: space.s3 }}
        />
      </View>
    </Card>
  );
}
