import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Button from '../Button';
import { type, radius, space, elevation } from '../../styles/tokens';

/**
 * Confirm dialog per DESIGN.md §2.8: max 400 wide, ghost cancel +
 * primary/destructive confirm, scrim tap and hardware back dismiss.
 * Replaces window.confirm() and bare Alert.alert() confirmations.
 */

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { tokens } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        accessibilityLabel={`Dismiss ${title}`}
        style={{
          flex: 1,
          backgroundColor: tokens.colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.s6,
        }}
      >
        {/* Stop scrim press from reaching the card */}
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400 }}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: tokens.colors.surfaceRaised,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              padding: space.s6,
              ...elevation.e3,
            }}
          >
            <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text, marginBottom: space.s2 }]}>
              {title}
            </Text>
            <Text style={[type.body, { color: tokens.colors.textMuted, marginBottom: space.s5 }]}>
              {message}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2 }}>
              <View style={{ minWidth: 100 }}>
                <Button text={cancelLabel} onPress={onCancel} variant="ghost" disabled={loading} />
              </View>
              <View style={{ minWidth: 120 }}>
                <Button
                  text={confirmLabel}
                  onPress={onConfirm}
                  variant={destructive ? 'danger' : 'primary'}
                  loading={loading}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
