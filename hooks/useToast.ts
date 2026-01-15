
import React, { useState, useCallback, createContext, useContext } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => string;
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

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration?: number) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration,
    };

    console.log('ToastProvider: Showing toast:', newToast);
    setToasts(prev => [...prev, newToast]);

    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    console.log('ToastProvider: Hiding toast:', id);
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    console.log('ToastProvider: Clearing all toasts');
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
