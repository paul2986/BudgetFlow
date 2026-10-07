import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space, font } from '../../styles/tokens';
import { toYMD } from '../../utils/dates';

/**
 * Optional date field styled like ui/Input: caption label, field fill, one
 * focus ring. Web uses the native <input type="date">; Android opens the
 * platform dialog; iOS expands an inline calendar under the field (the default
 * "compact" picker needs a second tap on its own pill). A "Clear" action
 * appears once a date is set.
 */

interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  helperText?: string;
  /** iOS: called once the inline calendar has opened, so a scrolling parent can bring it into view. */
  onExpand?: () => void;
}

export default function DateField({ label, value, onChange, placeholder = 'None', helperText, onExpand }: DateFieldProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const fieldStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 48,
    paddingHorizontal: space.s4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: focused || (Platform.OS === 'ios' && showPicker) ? tokens.colors.brand : tokens.colors.borderStrong,
    backgroundColor: tokens.colors.field,
    overflow: 'hidden' as const,
    ...(Platform.OS === 'web' && focused
      ? ({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.colors.brand, outlineOffset: -1 } as any)
      : null),
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s2 }}>
        <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{label}</Text>
        {value ? (
          <Pressable
            onPress={() => {
              setShowPicker(false);
              onChange(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {({ pressed }) => (
              <Text style={[type.caption, { color: tokens.colors.brand, opacity: pressed ? 0.5 : 1 }]}>Clear</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === 'web' ? (
        <View style={fieldStyle}>
          {/* The browser draws its own calendar button inside the input. */}
          <input
            type="date"
            aria-label={label}
            value={value ? toYMD(value) : ''}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return onChange(null);
              const d = new Date(v + 'T00:00:00');
              if (!isNaN(d.getTime())) onChange(d);
            }}
            onClick={(e) => {
              try {
                (e.target as any).showPicker?.();
              } catch {}
            }}
            style={{
              flex: 1,
              height: 46,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              color: value ? tokens.colors.text : tokens.colors.textFaint,
              fontSize: type.body.fontSize,
              fontFamily: (font(400) as any).fontFamily,
              colorScheme: tokens.isDark ? 'dark' : 'light',
              cursor: 'pointer',
            }}
          />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => {
              // iOS: toggle the inline calendar; opening on an empty field
              // selects today (as Reminders does) because tapping the
              // already-highlighted day wouldn't fire onChange.
              if (Platform.OS === 'ios') {
                if (!showPicker && !value) onChange(new Date());
                setShowPicker(!showPicker);
              } else {
                setShowPicker(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${value ? value.toDateString() : placeholder}`}
            style={({ pressed }) => [fieldStyle, pressed ? { backgroundColor: tokens.colors.border } : null]}
          >
            <Icon name="calendar-outline" size={18} color={tokens.colors.textMuted} style={{ marginRight: space.s2 }} />
            <Text style={[type.body, { color: value ? tokens.colors.text : tokens.colors.textFaint }]}>
              {value ? value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : placeholder}
            </Text>
          </Pressable>
          {showPicker ? (
            // The native calendar reports its height after mounting; only then
            // has the parent's content grown enough to scroll it into view.
            <View onLayout={(e) => (e.nativeEvent.layout.height > 0 ? setTimeout(() => onExpand?.(), 50) : undefined)}>
              <DateTimePicker
                value={value || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                themeVariant={tokens.isDark ? 'dark' : 'light'}
                accentColor={tokens.colors.brand}
                onChange={(_, d) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (d) onChange(d);
                }}
              />
            </View>
          ) : null}
        </>
      )}

      {helperText ? (
        <Text style={[type.caption, { color: tokens.colors.textFaint, marginTop: space.s1 }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}
