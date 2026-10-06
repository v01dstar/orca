// Fork: hangar machines on the phone — sign in (device flow), lifecycle, and add one as an Orca host.
import { useState } from 'react'
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MobileSettingsFrame } from '../settings/mobile-settings-menu'
import { colors, spacing } from '../theme/mobile-theme'
import { HangarButton as Button, hangarInputStyle } from './hangar-button'
import { HangarCreateMachine } from './hangar-create-machine'
import { HangarMachineRow } from './hangar-machine-row'
import { useHangarMachines } from './use-hangar-machines'

export function HangarScreen() {
  const router = useRouter()
  const hangar = useHangarMachines()
  const [serverUrl, setServerUrl] = useState('https://')

  return (
    <MobileSettingsFrame>
      <Text style={styles.title}>hangar</Text>
      {hangar.error ? <Text style={styles.error}>{hangar.error}</Text> : null}
      {!hangar.session ? (
        hangar.deviceCode ? (
          <View style={styles.section}>
            <Text style={styles.meta}>Approve this phone in hangar with the code</Text>
            <Text selectable style={styles.code}>
              {hangar.deviceCode.userCode}
            </Text>
            <Button
              primary
              label="Open hangar"
              onPress={() => void Linking.openURL(hangar.deviceCode?.verificationUri ?? '')}
            />
            <Text style={styles.meta}>Waiting for approval…</Text>
            <Button label="Cancel" onPress={hangar.cancelSignIn} />
          </View>
        ) : (
          <View style={styles.section}>
            <TextInput
              style={hangarInputStyle}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="hangar server URL"
            />
            <Button
              primary
              label="Sign in to hangar"
              disabled={serverUrl.length < 12}
              onPress={() => void hangar.signIn(serverUrl)}
            />
          </View>
        )
      ) : (
        <>
          <View style={styles.accountRow}>
            <Text style={styles.meta}>
              {hangar.session.login} · {new URL(hangar.session.serverUrl).host}
            </Text>
            <Button label="Sign out" onPress={() => void hangar.signOut()} />
          </View>
          <View style={styles.section}>
            {hangar.machines.length === 0 ? (
              <Text style={styles.meta}>
                {hangar.loading ? 'Checking hangar machines…' : 'No hangar machines yet.'}
              </Text>
            ) : (
              hangar.machines.map((row) => (
                <HangarMachineRow
                  key={row.machine.id}
                  row={row}
                  busy={hangar.busy[row.machine.id]}
                  hangar={hangar}
                  onOpen={(hostId) => router.push(`/h/${hostId}`)}
                />
              ))
            )}
          </View>
          <HangarCreateMachine hangar={hangar} />
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
  code: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm
  },
  error: { color: colors.statusRed, marginBottom: spacing.sm }
})
