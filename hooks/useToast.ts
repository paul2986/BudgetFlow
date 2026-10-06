
import React, { useState, useCallback, createContext, useContext } from 'react';
import { newId } from '../utils/ids';
import { haptics } from '../utils/haptics';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  /** A trailing text button (e.g. Undo). Pressing it also dismisses the toast. */
  action?: ToastAction;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number, action?: ToastAction) => string;
  hideToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  showToast: () => '',
  hideToast: () => {},
  clearAllToasts: () => {},
});

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration?: number, action?: ToastAction) => {
    const id = newId('toast');
    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration,
      action,
    };

    if (type === 'success') haptics.success();
    else if (type === 'error') haptics.error();

    setToasts(prev => [...prev, newToast]);

    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue: ToastContextType = {
    toasts,
    showToast,
    hideToast,
    clearAllToasts,
  };

  return React.createElement(
    ToastContext.Provider,
    { value: contextValue },
    children
  );
};
