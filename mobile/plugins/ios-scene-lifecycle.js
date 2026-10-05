const { withAppDelegate, withDangerousMod, withInfoPlist } = require('expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

// Fork (hangar builds): apps linked against the iOS 27 SDK (Xcode 27) must adopt the UIScene
// lifecycle — UIKit traps at launch otherwise — and Expo SDK 55's template does not yet. The
// AppDelegate keeps building the React Native factory; a SceneDelegate creates the window and
// forwards URLs. Pods are raised to iOS 16, the floor Xcode 27 and expo-router build against.
const MIN_IOS = '16.0'

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    var launchOptions = appDelegate.initialLaunchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`

const WINDOW_BLOCK =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/

function patchAppDelegate(contents) {
  if (contents.includes('class SceneDelegate')) {
    return contents
  }
  if (!WINDOW_BLOCK.test(contents)) {
    throw new Error(
      'ios-scene-lifecycle: the generated AppDelegate.swift changed shape; update the plugin'
    )
  }
  return contents
    .replace(WINDOW_BLOCK, '    initialLaunchOptions = launchOptions\n')
    .replace(
      '  var reactNativeFactory: RCTReactNativeFactory?\n',
      '  var reactNativeFactory: RCTReactNativeFactory?\n  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?\n'
    )
    .replace(
      'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
      `${SCENE_DELEGATE}\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate {`
    )
}

const POD_HOOK = `    # Fork: Xcode 27 rejects pod targets below iOS ${MIN_IOS} (plugins/ios-scene-lifecycle.js).
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_IOS}
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'
        end
      end
    end
`

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate'
          }
        ]
      }
    }
    return cfg
  })
  config = withAppDelegate(config, (cfg) => {
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents)
    return cfg
  })
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile')
      const contents = fs.readFileSync(podfile, 'utf8')
      if (!contents.includes('plugins/ios-scene-lifecycle.js')) {
        const anchor = '  post_install do |installer|\n'
        if (!contents.includes(anchor)) {
          throw new Error('ios-scene-lifecycle: Podfile has no post_install block')
        }
        // Why after react_native_post_install: it resets deployment targets we must override.
        const next = contents.replace(
          /(  post_install do \|installer\|\n[\s\S]*?\n    \)\n)/,
          `$1${POD_HOOK}`
        )
        fs.writeFileSync(podfile, next)
      }
      return cfg
    }
  ])
}

module.exports.patchAppDelegate = patchAppDelegate
module.exports.MIN_IOS = MIN_IOS
