import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import Icon from '../Icon';
import { type, space, radius, elevation, motion } from '../../styles/tokens';

/**
 * Pull-down menu (iOS UIMenu idiom): a small panel that drops from the button
 * that opened it, grouped items with a checkmark on the current choice, and a
 * clear scrim that dismisses on tap. Pass the trigger's window rect as
 * `anchor` (from `measureInWindow`); the panel right-aligns to it (or left,
 * with `align="start"`) and opens upward when there isn't room below.
 * Destructive items are red and go last in their own section, as on iOS.
 */

export interface MenuItem {
  key: string;
  label: string;
  icon?: string;
  /** Secondary line under the label (e.g. current state, or why it's disabled). */
  detail?: string;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MenuProps {
  visible: boolean;
  onClose: () => void;
  anchor: MenuAnchor | null;
  sections: MenuSection[];
  /** Accessible name for the menu. */
  label: string;
  width?: number;
  /** Which edge of the anchor the panel lines up with: 'end' (default, right) or 'start' (left, e.g. in a sidebar). */
  align?: 'start' | 'end';
}

export default function Menu({ visible, onClose, anchor, sections, label, width = 248, align = 'end' }: MenuProps) {
  const { tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [panelHeight, setPanelHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, ...motion.spring, useNativeDriver: true }).start();
  }, [visible, reduceMotion, progress]);

  if (!anchor) return null;

  const horizontal =
    align === 'start'
      ? { left: Math.max(space.s4, Math.min(anchor.x, window.width - width - space.s4)) }
      : { right: Math.max(space.s4, window.width - (anchor.x + anchor.width)) };
  const below = anchor.y + anchor.height + space.s2;
  const fitsBelow = below + panelHeight <= window.height - space.s4;
  const top = fitsBelow ? below : Math.max(space.s4, anchor.y - space.s2 - panelHeight);
  // Only reserve the checkmark column when the menu is a choice list.
  const hasChecks = sections.some((s) => s.items.some((i) => i.checked !== undefined));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={`Close ${label}`} style={StyleSheet.absoluteFill} />
      <Animated.View
        accessibilityViewIsModal
        accessibilityRole="menu"
        accessibilityLabel={label}
        onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top,
          ...horizontal,
          width,
          maxWidth: window.width - space.s4 * 2,
          backgroundColor: tokens.colors.surfaceRaised,
          borderRadius: radius.lg,
          borderWidth: tokens.isDark ? 1 : 0,
          borderColor: tokens.colors.border,
          overflow: 'hidden',
          ...elevation.e3,
          opacity: progress,
          transform: reduceMotion
            ? []
            : [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [fitsBelow ? -space.s2 : space.s2, 0],
                  }),
                },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
        }}
      >
        {sections.map((section, si) => (
          <View key={section.title ?? si}>
            {si > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.border }} /> : null}
            {section.title ? (
              <Text
                accessibilityRole="header"
                style={[
                  type.caption,
                  { color: tokens.colors.textMuted, paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s1 },
                ]}
              >
                {section.title}
              </Text>
            ) : null}
            {section.items.map((item) => {
              const fg = item.destructive ? tokens.colors.danger : tokens.colors.text;
              return (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
                  accessibilityState={{ checked: item.checked, disabled: !!item.disabled }}
                  // Web: accessibilityState.checked isn't passed through for menu items.
                  aria-checked={item.checked}
                  style={({ pressed, hovered }: any) => ({
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: space.s4,
                    paddingVertical: item.detail ? space.s2 : 0,
                    gap: space.s3,
                    opacity: item.disabled ? 0.45 : 1,
                    backgroundColor: !item.disabled && (pressed || hovered) ? tokens.colors.surfaceHover : 'transparent',
                  })}
                >
                  {hasChecks ? (
                    <View style={{ width: 18, alignItems: 'center' }}>
                      {item.checked ? <Icon name="checkmark" size={18} color={tokens.colors.brand} /> : null}
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: fg }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.detail ? (
                      <Text style={[type.caption, { color: tokens.colors.textMuted }]} numberOfLines={2}>
                        {item.detail}
                      </Text>
                    ) : null}
                  </View>
                  {item.icon ? (
                    <Icon
                      name={item.icon as any}
                      size={18}
                      color={item.destructive ? tokens.colors.danger : tokens.colors.textMuted}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>
    </Modal>
  );
}
