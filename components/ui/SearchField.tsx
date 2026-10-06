import { useState } from 'react';
import { View, TextInput, Pressable, Platform, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space, font } from '../../styles/tokens';

/**
 * Search field (iOS search bar idiom): filled capsule on the page, leading
 * magnifier, clear button while there's text. The container carries the one
 * focus ring on web; the inner input's UA ring is switched off.
 */

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function SearchField({ value, onChangeText, placeholder = 'Search', style }: SearchFieldProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 44,
          paddingHorizontal: space.s3,
          borderRadius: radius.md,
          backgroundColor: tokens.colors.surface,
          ...(Platform.OS === 'web' && focused
            ? ({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.colors.brand, outlineOffset: 0 } as any)
            : null),
        },
        style,
      ]}
    >
      <Icon name="search" size={18} color={tokens.colors.textFaint} style={{ marginRight: space.s2 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textFaint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          type.body,
          {
            flex: 1,
            color: tokens.colors.text,
            paddingVertical: space.s2,
            ...font(400),
            // web: container carries the ring
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
          },
        ]}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: space.s2 })}
        >
          <Icon name="close-circle" size={18} color={tokens.colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}
