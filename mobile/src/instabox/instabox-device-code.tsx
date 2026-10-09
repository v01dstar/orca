import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { InstaboxDeviceStart } from '../../../src/shared/instabox/instabox-api-types'
import { colors, spacing } from '../theme/mobile-theme'
import { InstaboxButton } from './instabox-button'

// instabox signs in through GitHub's device flow. GitHub's app does not handle /login/device
// (its app-site-association excludes /login), so the page opens in the browser; the code is
// copied first so it can be pasted there.
export function InstaboxDeviceCode({
  start,
  onCancel
}: {
  start: InstaboxDeviceStart
  onCancel: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(start.userCode)
    setCopied(true)
  }
  return (
    <View style={styles.section}>
      <Text style={styles.meta}>Approve this phone on GitHub with the code</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy code ${start.userCode}`}
        onPress={() => void copy()}
        style={({ pressed }) => [styles.codeBox, pressed && styles.pressed]}
      >
        <Text style={styles.code}>{start.userCode}</Text>
        <Text style={styles.hint}>{copied ? 'Copied' : 'Tap to copy'}</Text>
      </Pressable>
      <InstaboxButton
        primary
        label="Copy code and open GitHub"
        onPress={() => void copy().then(() => Linking.openURL(start.verificationUri))}
      />
      <Text style={styles.meta}>
        Paste the code on the GitHub page and approve; this screen continues on its own.
      </Text>
      <InstaboxButton label="Cancel" onPress={onCancel} />
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.bgPanel,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  meta: { fontSize: 13, color: colors.textSecondary },
  codeBox: { alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 8 },
  pressed: { backgroundColor: colors.bgRaised },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 2, color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs }
})
