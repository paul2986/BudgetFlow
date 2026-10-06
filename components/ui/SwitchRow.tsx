import { View, Text, Switch } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space } from '../../styles/tokens';

/** A settings row with a switch, which stays its own control (the row isn't one big button). */
export default function SwitchRow({
  icon,
  title,
  caption,
  value,
  onChange,
  disabled,
  showSeparator = true,
}: {
  icon: string;
  title: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  showSeparator?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        paddingHorizontal: space.s4,
        paddingVertical: space.s3,
        borderBottomWidth: showSeparator ? 1 : 0,
        borderBottomColor: tokens.colors.border,
      }}
    >
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
        <Icon name={icon as any} size={18} color={tokens.colors.textMuted} />
      </View>
      <View style={{ flex: 1, marginRight: space.s3 }}>
        <Text style={[type.bodyMed, { color: tokens.colors.text }]}>{title}</Text>
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.brand }}
        thumbColor={tokens.colors.switchThumb}
        // @ts-ignore web-only prop on react-native-web's Switch
        activeThumbColor={tokens.colors.switchThumb}
      />
    </View>
  );
}
