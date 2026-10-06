import { View, Text, Pressable, Platform, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space } from '../../styles/tokens';
import { haptics } from '../../utils/haptics';

/**
 * Single-choice pill group for option sets too long for a SegmentedControl
 * (frequency, category, person). Selection = solid brand fill + checkmark,
 * never color alone; a subtle tint was too close to the unselected grey. 36pt pills with hitSlop to a 44pt target. An optional
 * trailing "add" pill covers inline creation (new person, new category).
 */

export interface PillOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface ChoicePillsProps<T extends string> {
  options: PillOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Accessible group name; also shown as the field label when `showLabel`. */
  label: string;
  showLabel?: boolean;
  addLabel?: string;
  onAdd?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  label,
  showLabel = true,
  addLabel,
  onAdd,
  disabled,
  style,
}: ChoicePillsProps<T>) {
  const { tokens } = useTheme();

  const pillStyle = (selected: boolean, pressed: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 36,
    paddingHorizontal: space.s3,
    borderRadius: radius.full,
    // `border` grey reads on the page grey and on white/raised cards alike.
    backgroundColor: selected ? tokens.colors.brand : pressed ? tokens.colors.borderStrong : tokens.colors.border,
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <View style={style}>
      {showLabel ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>{label}</Text>
      ) : null}
      <View
        accessibilityRole={Platform.OS === 'web' ? ('radiogroup' as any) : 'radiogroup'}
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const fg = selected ? tokens.colors.onBrand : tokens.colors.text;
          return (
            <Pressable
              key={option.value}
              disabled={disabled}
              onPress={() => {
                if (selected) return;
                haptics.selection();
                onChange(option.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled: !!disabled }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => pillStyle(selected, pressed)}
            >
              {selected ? (
                <Icon name="checkmark" size={14} color={fg} style={{ marginRight: space.s1 }} />
              ) : option.icon ? (
                <Icon name={option.icon as any} size={14} color={tokens.colors.textMuted} style={{ marginRight: space.s1 }} />
              ) : null}
              <Text style={[type.caption, { color: fg }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        {onAdd ? (
          <Pressable
            disabled={disabled}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={addLabel || 'Add'}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => ({
              ...pillStyle(false, pressed),
              backgroundColor: pressed ? tokens.colors.border : 'transparent',
              borderWidth: 1,
              borderColor: tokens.colors.borderStrong,
              borderStyle: 'dashed' as const,
            })}
          >
            <Icon name="add" size={14} color={tokens.colors.brand} style={{ marginRight: space.s1 }} />
            <Text style={[type.caption, { color: tokens.colors.brand }]}>{addLabel || 'Add'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
