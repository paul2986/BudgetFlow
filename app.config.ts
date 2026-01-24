import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: 'BudgetFlow',
    slug: 'BudgetFlow',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
        image: './assets/images/icon.png',
        resizeMode: 'contain',
        backgroundColor: '#000000',
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.budgetflow.app',
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false,
            NSFaceIDUsageDescription:
                'This app uses Face ID to securely unlock your budget data and protect your financial information.',
            NSCameraUsageDescription:
                'This app uses Face ID to securely unlock your budget data and protect your financial information.',
        },
    },
    android: {
        adaptiveIcon: {
            foregroundImage: './assets/images/icon.png',
            backgroundColor: '#000000',
        },
        package: 'com.budgetflow.app',
        permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT'],
    },
    web: {
        favicon: './assets/images/icon.png',
        bundler: 'metro',
    },
    plugins: [
        'expo-font',
        'expo-router',
        [
            'expo-local-authentication',
            {
                faceIDPermission:
                    'This app uses Face ID to securely unlock your budget data and protect your financial information.',
            },
        ],
    ],
    scheme: 'budgetflow',
    experiments: {
        typedRoutes: true,
    },
    extra: {
        router: {},
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        shareApiUrl: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`,
        shareTtlSec: 86400,
        authRedirect: process.env.EXPO_PUBLIC_AUTH_REDIRECT,
        authRedirectHttps: process.env.EXPO_PUBLIC_AUTH_REDIRECT_HTTPS,
    },
});
