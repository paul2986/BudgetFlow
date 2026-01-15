import { Platform, Alert as RNAlert } from 'react-native';

/**
 * Web-compatible alert utility
 * Uses window.confirm/alert on web, React Native Alert on native
 */
export const Alert = {
    alert: (title: string, message?: string, buttons?: any[]) => {
        if (Platform.OS === 'web') {
            // Simple web implementation
            if (buttons && buttons.length > 1) {
                // Confirmation dialog
                const confirmed = window.confirm(`${title}\n\n${message || ''}`);
                const confirmButton = buttons.find(b => b.style === 'destructive' || b.text === 'OK' || b.text === 'Yes' || b.text === 'Remove' || b.text === 'Delete');
                if (confirmed && confirmButton?.onPress) {
                    confirmButton.onPress();
                }
            } else {
                // Simple alert
                window.alert(`${title}\n\n${message || ''}`);
                if (buttons && buttons[0]?.onPress) {
                    buttons[0].onPress();
                }
            }
        } else {
            // Use React Native Alert on native platforms
            RNAlert.alert(title, message, buttons);
        }
    }
};
