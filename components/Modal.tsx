
import React from 'react';
import { View, Text, TouchableOpacity, Modal as RNModal, Platform, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from './Icon';

interface ModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: number;
}

export default function Modal({ visible, onClose, title, children, maxWidth = 600 }: ModalProps) {
    const { currentColors, isDarkMode } = useTheme();
    const { themedStyles } = useThemedStyles();

    if (Platform.OS !== 'web' && !visible) return null;

    return (
        <RNModal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                style={styles.overlay}
                onPress={onClose}
            >
                <Pressable
                    style={[
                        styles.modalContainer,
                        {
                            backgroundColor: currentColors.background,
                            borderColor: currentColors.border,
                            maxWidth: maxWidth,
                        }
                    ]}
                    onPress={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
                        <Text style={[themedStyles.subtitle, { marginBottom: 0 }]}>{title}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Icon name="close" size={24} style={{ color: currentColors.textSecondary }} />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={styles.body}>
                        {children}
                    </View>
                </Pressable>
            </Pressable>
        </RNModal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        borderRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
    },
    closeButton: {
        padding: 4,
    },
    body: {
        maxHeight: '80vh' as any,
    }
});
