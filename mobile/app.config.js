// Why this file exists: a bare "expo-notifications" plugin entry writes
// `aps-environment: development` into the iOS entitlements, while push-token.ts
// reports `production` for every non-__DEV__ build. A TestFlight or App Store build
// would then register a production APNs token against a sandbox entitlement, and the
// gateway's pushes would be accepted by Apple and delivered nowhere. Deriving the
// mode from an env var the release workflow sets makes the two agree by construction
// instead of relying on the export step to rewrite the entitlement.
//
// app.json stays the source for everything else: Expo reads it first and hands it to
// this function, so the fastlane version/buildNumber rewrite still flows through.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

// Fork: `ORCA_FLAVOR=instabox` builds an app that installs beside the official Orca mobile app.
const INSTABOX_FLAVOR = process.env.ORCA_FLAVOR === 'instabox'

module.exports = ({ config }) => ({
  ...config,
  ...(INSTABOX_FLAVOR
    ? { name: 'Instabox', scheme: 'instabox', extra: { ...config.extra, appFlavor: 'instabox' } }
    : {}),
  ios: {
    ...config.ios,
    ...(INSTABOX_FLAVOR ? { bundleIdentifier: 'com.v01dstar.instabox' } : {}),
    entitlements: { ...config.ios?.entitlements, 'aps-environment': APS_ENVIRONMENT }
  },
  ...(INSTABOX_FLAVOR ? { android: { ...config.android, package: 'com.v01dstar.instabox' } } : {}),
  plugins: [
    ...(config.plugins ?? []).map((plugin) =>
      INSTABOX_FLAVOR && Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
        ? [plugin[0], { ...plugin[1], ios: { ...plugin[1]?.ios, deploymentTarget: '16.0' } }]
        : plugin
    ),
    // Fork: instabox builds are made with Xcode 27 (iOS 27 SDK), which requires scene lifecycle.
    ...(INSTABOX_FLAVOR ? ['./plugins/ios-scene-lifecycle.js'] : [])
  ].map((plugin) =>
    plugin === 'expo-notifications'
      ? [
          'expo-notifications',
          {
            enableBackgroundRemoteNotifications: true,
            mode: APS_ENVIRONMENT,
            icon: './assets/notification-icon.png'
          }
        ]
      : plugin
  )
})
