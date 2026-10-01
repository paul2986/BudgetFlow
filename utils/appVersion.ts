import Constants from 'expo-constants';

// The release version (package.json, via app.config.ts) and the build it came
// from, e.g. "1.1.0 (b102809)".
const version = Constants.expoConfig?.version ?? '';
const buildId = (Constants.expoConfig?.extra?.buildId as string | undefined) ?? '';

export const appVersionLabel = buildId ? `${version} (${buildId})` : version;
