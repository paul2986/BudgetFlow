import { View, Text } from 'react-native';
import Button from '../Button';
import Icon from '../Icon';
import { Card, Chip } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { coverageLabel, telHref, type DebtHelpService } from '../../utils/debtHelp';
import { type, space } from '../../styles/tokens';

/**
 * One free debt-advice service: who it is, what it does, where it helps, and
 * two ways in (call, website). The number is in the button text, not only behind
 * it, so it can be read and dialled by hand where a tap can't place a call.
 */

interface DebtHelpServiceCardProps {
  service: DebtHelpService;
  onOpen: (url: string) => void;
}

export default function DebtHelpServiceCard({ service, onOpen }: DebtHelpServiceCardProps) {
  const { tokens } = useTheme();
  const kindIcon = service.kind === 'Charity' ? 'heart-outline' : 'shield-checkmark-outline';

  return (
    <Card title={service.name} action={<Chip label={service.kind} icon={kindIcon} outlined />}>
      <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{coverageLabel(service)}</Text>
      <Text style={[type.body, { color: tokens.colors.text, marginTop: space.s2 }]}>{service.summary}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s3 }}>
        <Button
          variant="secondary"
          text={`Call ${service.phone.display}`}
          icon={<Icon name="call-outline" size={18} color={tokens.colors.text} />}
          onPress={() => onOpen(telHref(service.phone.dial))}
          style={{ width: 'auto', flexGrow: 1, flexBasis: 188, marginTop: 0, paddingHorizontal: space.s3 }}
        />
        <Button
          variant="outline"
          text="Website"
          icon={<Icon name="open-outline" size={18} color={tokens.colors.text} />}
          onPress={() => onOpen(service.url)}
          style={{ width: 'auto', flexGrow: 1, flexBasis: 108, marginTop: 0, paddingHorizontal: space.s3 }}
        />
      </View>
    </Card>
  );
}
