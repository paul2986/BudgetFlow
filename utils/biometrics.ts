import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

// Face ID / Touch ID, where the device has it set up. Only ever a quicker way in
// than the code (the code always works), so a device without it, or the web,
// simply never offers it.

export type BiometricKind = 'Face ID' | 'Touch ID' | 'biometrics';

/** What this device can unlock with, or null when it has nothing (or nothing enrolled). */
export const getBiometricKind = async (): Promise<BiometricKind | null> => {
  if (Platform.OS === 'web') return null;
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return null;
    if (!(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
    return 'biometrics';
  } catch (error) {
    console.error('biometrics: could not check the device:', error);
    return null;
  }
};

/** Ask the device to recognise the person. False when they cancel, fail, or it isn't available. */
export const authenticateWithBiometrics = async (promptMessage: string): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // The way out is the budget's own code, not the device passcode.
      cancelLabel: 'Use code',
      fallbackLabel: '',
      disableDeviceFallback: true,
    });
    return result.success;
  } catch (error) {
    console.error('biometrics: authentication error:', error);
    return false;
  }
};
