
import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from './Icon';
import { BlurView } from 'expo-blur';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export default function InfoModal({ visible, onClose, title, description }: InfoModalProps) {
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 400,
          }}
        >
          <View
            style={[
              themedStyles.card,
              {
                backgroundColor: currentColors.backgroundAlt,
                borderColor: currentColors.border,
                borderWidth: 2,
                padding: 24,
                marginBottom: 0,
              },
            ]}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: currentColors.info + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Icon name="information-circle" size={24} style={{ color: currentColors.info }} />
              </View>
              <Text style={[themedStyles.subtitle, { fontSize: 20, fontWeight: '700', marginBottom: 0, flex: 1 }]}>
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: currentColors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={20} style={{ color: currentColors.text }} />
              </TouchableOpacity>
            </View>

            {/* Description */}
            <ScrollView
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[themedStyles.text, { lineHeight: 24 }]}>
                {description}
              </Text>
            </ScrollView>

            {/* Close Button */}
            <TouchableOpacity
              onPress={onClose}
              style={{
                backgroundColor: currentColors.primary,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              <Text style={[themedStyles.text, { color: '#fff', fontWeight: '600', fontSize: 16 }]}>
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
