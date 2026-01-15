
// This file is deprecated and should not be used
// All biometric functionality has been moved to useBudgetLock

export const useBiometricLock = () => {
  console.warn('useBiometricLock is deprecated. Use useBudgetLock instead.');
  return {
    isEnabled: false,
    canUseBiometrics: false,
    authenticate: async () => false,
    enable: async () => false,
    disable: async () => false,
  };
};

export default useBiometricLock;
