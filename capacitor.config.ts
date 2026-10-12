import type { CapacitorConfig } from '@capacitor/cli'

// Native app (iOS/Android) wrapping the same web app. See NATIVE.md.
const config: CapacitorConfig = {
  appId: 'io.github.nilsb44.guldkorn',
  appName: 'Guldkorn',
  webDir: 'dist',
  backgroundColor: '#faf7f2',
  ios: {
    contentInset: 'never',
  },
  android: {
    // Photos are read via our own plugin; the web view never needs file:// access.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#c8963e',
    },
  },
}

export default config
