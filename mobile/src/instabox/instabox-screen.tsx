// Fork: instabox machines on the phone — sign in (device flow), lifecycle, and add one as an Orca host.
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MobileSettingsFrame } from '../settings/mobile-settings-menu'
import { colors, spacing } from '../theme/mobile-theme'
import { InstaboxButton as Button, instaboxInputStyle } from './instabox-button'
import { InstaboxCreateMachine } from './instabox-create-machine'
import { InstaboxDeviceCode } from './instabox-device-code'
import { InstaboxMachineRow } from './instabox-machine-row'
import { useInstaboxMachines } from './use-instabox-machines'
import { INSTABOX_DEFAULT_SERVER_URL } from '../../../src/shared/instabox/instabox-api-types'

export function InstaboxScreen() {
  const router = useRouter()
  const instabox = useInstaboxMachines()
  const [serverUrl, setServerUrl] = useState(INSTABOX_DEFAULT_SERVER_URL)

  return (
    <MobileSettingsFrame>
      <Text style={styles.title}>Instabox</Text>
      {instabox.error ? <Text style={styles.error}>{instabox.error}</Text> : null}
      {!instabox.session ? (
        instabox.deviceCode ? (
          <InstaboxDeviceCode start={instabox.deviceCode} onCancel={instabox.cancelSignIn} />
        ) : (
          <View style={styles.section}>
            <TextInput
              style={instaboxInputStyle}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Instabox server URL"
            />
            <Button
              primary
              label="Sign in to Instabox"
              disabled={serverUrl.length < 12}
              onPress={() => void instabox.signIn(serverUrl)}
            />
          </View>
        )
      ) : (
        <>
          <View style={styles.accountRow}>
            <Text style={styles.meta}>
              {instabox.session.login} · {new URL(instabox.session.serverUrl).host}
            </Text>
            <Button label="Sign out" onPress={() => void instabox.signOut()} />
          </View>
          <View style={styles.section}>
            {instabox.machines.length === 0 ? (
              <Text style={styles.meta}>
                {instabox.loading ? 'Checking Instabox machines…' : 'No Instabox machines yet.'}
              </Text>
            ) : (
              instabox.machines.map((row) => (
                <InstaboxMachineRow
                  key={row.machine.id}
                  row={row}
                  busy={instabox.busy[row.machine.id]}
                  instabox={instabox}
                  onOpen={(hostId) => router.push(`/h/${hostId}`)}
                />
              ))
            )}
          </View>
          <InstaboxCreateMachine instabox={instabox} />
        </>
      )}
    </MobileSettingsFrame>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  section: {
    backgroundColor: colors.bgPanel,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  meta: { fontSize: 13, color: colors.textSecondary },
  error: { color: colors.statusRed, marginBottom: spacing.sm }
})
