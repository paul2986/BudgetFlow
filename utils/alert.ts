import { Alert as NativeAlert, AlertButton, Platform } from 'react-native';

/**
 * Drop-in replacement for React Native's `Alert` (react-native-web's is a
 * no-op). Native keeps the platform alert, the most familiar UI there; web
 * routes the same call to the themed <DialogHost /> in the root layout instead
 * of the browser's unstyled window.confirm.
 */

export interface DialogRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Presenter = (request: DialogRequest) => void;

let presenter: Presenter | null = null;

/** Called by <DialogHost /> on mount; returns an unregister function. */
export const registerDialogPresenter = (fn: Presenter) => {
  presenter = fn;
  return () => {
    if (presenter === fn) presenter = null;
  };
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    const resolved = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    if (presenter) {
      presenter({ title, message, buttons: resolved });
    } else if (typeof window !== 'undefined') {
      // Host not mounted yet (very early boot): fall back to the browser.
      const cancel = resolved.find((b) => b.style === 'cancel');
      const action = resolved.find((b) => b !== cancel);
      if (cancel && action) {
        (window.confirm(message ? `${title}\n\n${message}` : title) ? action : cancel).onPress?.();
      } else {
        window.alert(message ? `${title}\n\n${message}` : title);
        resolved[0]?.onPress?.();
      }
    }
  },
};
