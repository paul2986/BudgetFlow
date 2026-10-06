module.exports = function (api) {
  // Cache keyed on environment so the production-only console stripping below
  // is applied/skipped correctly per build.
  api.cache.using(() => process.env.NODE_ENV);

  const isProduction = process.env.NODE_ENV === 'production';

  const plugins = [];

  // Strip console.* from production bundles so any stray debug logging (expense
  // ids, amounts, user ids) never ships. Keep error/warn so real failures still
  // surface.
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
