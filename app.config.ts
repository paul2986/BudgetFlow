import { ExpoConfig, ConfigContext } from 'expo/config';
import { execSync } from 'child_process';
import { version } from './package.json';

// Which build this is, shown next to the version in Settings so you can tell
// a fresh deploy from a cached one: the commit Vercel (or EAS) built, else the
// local checkout's.
const buildId = (() => {
    const fromCi = process.env.VERCEL_GIT_COMMIT_SHA || process.env.EAS_BUILD_GIT_COMMIT_HASH;
    if (fromCi) return fromCi.slice(0, 7);
    try {
        return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return 'dev';
    }
})();

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: 'BudgetFlow',
    slug: 'BudgetFlow',
    // The app version lives in package.json; bump it there with every release.
    version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
        supportsTablet: true,
        // A build to your own phone with a free Apple ID can't use the real identifier (it's
        // registered to another team), so set IOS_BUNDLE_ID and APPLE_TEAM_ID in .env.local
        // (git-ignored). Unset, these are the app's real values.
        bundleIdentifier: process.env.IOS_BUNDLE_ID || 'com.budgetflow.app',
        appleTeamId: process.env.APPLE_TEAM_ID || undefined,
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false,
            NSFaceIDUsageDescription:
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
        'expo-sharing',
        [
            'expo-splash-screen',
            {
                image: './assets/images/icon.png',
                resizeMode: 'contain',
                backgroundColor: '#000000',
            },
        ],
        './plugins/withMinimumPodsDeploymentTarget',
        './plugins/withUserScriptSandboxingDisabled',
        './plugins/withSceneLifecycle',
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
        buildId,
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        shareApiUrl: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`,
        shareTtlSec: 86400,
        authRedirect: process.env.EXPO_PUBLIC_AUTH_REDIRECT,
        authRedirectHttps: process.env.EXPO_PUBLIC_AUTH_REDIRECT_HTTPS,
    },
});
