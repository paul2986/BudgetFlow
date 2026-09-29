import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, Platform, Animated, StyleSheet, DimensionValue } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint, useBottomInset } from '../../hooks/useBreakpoint';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { type, space, radius, elevation, motion } from '../../styles/tokens';

/**
 * Modal sheet, presented the way each platform expects:
 * - iOS phones: the native page sheet (swipe to dismiss, system material).
 * - Other phones / touch web: a bottom sheet that springs up from the edge it
 *   leaves by; a cross-fade under Reduce Motion.
 * - Medium and up: a centered panel over a dimming scrim, or anchored under
 *   the header's trailing button when `anchor="headerTrailing"`.
 * Title bar: optional leading/trailing text actions around a centered title.
 * Children should include their own ScrollView when content can overflow.
 */

export interface SheetAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  leadingAction?: SheetAction;
  trailingAction?: SheetAction;
  /** Pinned below the content (e.g. a primary button). */
  footer?: React.ReactNode;
  /** Medium+ placement. Defaults to centered. */
  anchor?: 'center' | 'headerTrailing';
  /** Medium+ panel width. */
  width?: number;
  /** Top offset when anchored under the header. */
  anchorTop?: number;
  /** Page-grey body so ListGroups inside read as groups (iOS grouped sheet). */
  grouped?: boolean;
  children: React.ReactNode;
}

export default function Sheet({
  visible,
  onClose,
  title,
  leadingAction,
  trailingAction,
  footer,
  anchor = 'center',
  width = 480,
  anchorTop = 0,
  grouped = false,
  children,
}: SheetProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();
  const reduceMotion = useReducedMotion();
  const bottomInset = useBottomInset();
  const isCompact = bp.isCompact;
  const useNativeSheet = Platform.OS === 'ios' && isCompact;

  const sheetY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible || !isCompact || useNativeSheet) return;
    if (reduceMotion) {
      sheetY.setValue(0);
      return;
    }
    sheetY.setValue(480);
    Animated.spring(sheetY, { toValue: 0, ...motion.spring, useNativeDriver: true }).start();
  }, [visible, isCompact, useNativeSheet, reduceMotion, sheetY]);

  const titleBar = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.s3,
        minHeight: 52,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: tokens.colors.borderStrong,
      }}
    >
      <View style={{ minWidth: 72, alignItems: 'flex-start' }}>
        {leadingAction ? <TextAction {...leadingAction} /> : null}
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[type.h3, { flex: 1, textAlign: 'center', color: tokens.colors.text }]}
      >
        {title}
      </Text>
      <View style={{ minWidth: 72, alignItems: 'flex-end' }}>
        {trailingAction ? <TextAction {...trailingAction} /> : null}
      </View>
    </View>
  );

  const panel = (
    <>
      {titleBar}
      <View style={{ flexShrink: 1, backgroundColor: grouped ? tokens.colors.bg : undefined }}>{children}</View>
      {footer ? (
        <View
          style={{
            paddingHorizontal: space.s5,
            paddingTop: space.s4,
            // Bottom sheets sit on the home indicator; keep the footer above it.
            paddingBottom: isCompact ? Math.max(bottomInset, space.s4) : space.s4,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: tokens.colors.borderStrong,
          }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );

  if (useNativeSheet) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: tokens.colors.surfaceRaised }}>{panel}</View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel={`Close ${title}`}
        style={{ ...StyleSheet.absoluteFill, backgroundColor: tokens.colors.overlay }}
      />
      {isCompact ? (
        <Animated.View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '88%',
            backgroundColor: tokens.colors.surfaceRaised,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            transform: [{ translateY: sheetY }],
            ...elevation.e3,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 5,
              borderRadius: radius.full,
              backgroundColor: tokens.colors.borderStrong,
              marginTop: space.s2,
            }}
          />
          {panel}
        </Animated.View>
      ) : (
        <View
          pointerEvents="box-none"
          style={
            anchor === 'headerTrailing'
              ? { position: 'absolute', top: anchorTop, right: bp.gutter }
              : { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: space.s6 }
          }
        >
          <View
            accessibilityViewIsModal
            style={{
              width,
              maxWidth: '100%',
              maxHeight: (anchor === 'headerTrailing' ? '80%' : '85%') as DimensionValue,
              backgroundColor: tokens.colors.surfaceRaised,
              borderRadius: radius.lg,
              borderWidth: tokens.isDark ? 1 : 0,
              borderColor: tokens.colors.border,
              overflow: 'hidden',
              ...elevation.e3,
            }}
          >
            {panel}
          </View>
        </View>
      )}
    </Modal>
  );
}

function TextAction({ label, onPress, disabled }: SheetAction) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: space.s2,
        opacity: disabled ? 0.35 : pressed ? 0.5 : 1,
      })}
    >
      <Text style={[type.bodyMed, { color: tokens.colors.brand }]}>{label}</Text>
    </Pressable>
  );
}
