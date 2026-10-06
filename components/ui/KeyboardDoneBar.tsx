import React, { useId } from 'react';
import { InputAccessoryView, Keyboard, KeyboardTypeOptions, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { type, space } from '../../styles/tokens';

/**
 * iOS number pads have no Return key, so a field using one can only be left by
 * tapping elsewhere. This is a full-width brand bar attached to the top of the
 * keyboard with a Done button. Everything here is a no-op off iOS.
 *
 * Usage, in a component that renders a TextInput:
 *   const done = useKeyboardDone(keyboardType);
 *   <TextInput {...done.inputProps} />
 *   {done.bar}
 *
 * Each field gets its own bar (and id): React Native attaches an accessory to
 * the field with the matching id once, when the bar mounts, and only if that
 * field is already on screen. One bar mounted at the root never finds a field
 * that appears later, and sharing an id attaches every bar to the first field.
 *
 * The bar needs an explicit height: React Native sizes the accessory from its
 * children and gives it none of its own, so a flexible child collapses to 0.
 */

const NUMBER_PADS: KeyboardTypeOptions[] = ['numeric', 'number-pad', 'decimal-pad', 'phone-pad'];

function KeyboardDoneBar({ nativeID }: { nativeID: string }) {
  const { tokens } = useTheme();

  return (
    <InputAccessoryView nativeID={nativeID}>
      {/* The transparent strip above the bar is the gap React Native leaves
          between a scrolled-into-view field and the keyboard area. */}
      <View style={{ paddingTop: space.s2 }}>
        <Pressable
          // Dismissing blurs the focused field, which is what commits it
          // (CurrencyInput formats on blur), same as tapping away.
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={({ pressed }) => ({
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.colors.brand,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={[type.bodyMed, { color: tokens.colors.onBrand }]}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export function useKeyboardDone(keyboardType?: KeyboardTypeOptions): {
  /** Spread onto the TextInput. */
  inputProps: { inputAccessoryViewID?: string };
  /** Render next to the TextInput; null unless this is an iOS number pad. */
  bar: React.ReactElement | null;
} {
  const id = useId();
  if (Platform.OS !== 'ios' || !keyboardType || !NUMBER_PADS.includes(keyboardType)) {
    return { inputProps: {}, bar: null };
  }
  return { inputProps: { inputAccessoryViewID: id }, bar: <KeyboardDoneBar nativeID={id} /> };
}
