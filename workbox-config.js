module.exports = {
	globDirectory: 'dist',
	globPatterns: [
		'**/*.{js,css,html,png,jpg,jpeg,svg,ico,json}'
	],
	// The web bundle is ~2.1 MB, over Workbox's 2 MB default. Precaching it
	// keeps each service worker's index.html and bundle a matching pair:
	// otherwise, after a deploy, the old worker serves a cached index.html
	// whose bundle no longer exists and the page loads blank until a reload.
	maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
	swDest: 'dist/sw.js',
	skipWaiting: true,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: [{
		// Same-origin only. Cross-origin requests (Supabase API, Google Fonts)
		// go straight to the network: fetches made by the service worker are
		// checked against the CSP's connect-src, which blocks Google Fonts, and
		// caching Supabase responses would keep budget data after sign-out.
		urlPattern: ({ url }) => url.origin === self.location.origin,
		handler: 'NetworkFirst',
		options: {
			cacheName: 'app-runtime',
			networkTimeoutSeconds: 10,
			backgroundSync: {
				name: 'navigation-queue',
				options: {
					maxRetentionTime: 24 * 60 // 24 hours
				}
			}
		}
	}]
};
