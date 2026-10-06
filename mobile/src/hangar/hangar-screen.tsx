// Fork: hangar machines on the phone — sign in (device flow), lifecycle, and add one as an Orca host.
import { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useRouter } from 'expo-router'
import { MobileSettingsFrame } from '../settings/mobile-settings-menu'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { hangarMachineActions } from '../../../src/shared/hangar/hangar-api-types'
import { useHangarMachines, type HangarMachineRowModel } from './use-hangar-machines'

function Button({
  label,
  onPress,
  primary,
  disabled
}: {
  label: string
  onPress: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        (pressed || disabled) && styles.buttonDim
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  )
}

function MachineRow({
  row,
  busy,
  hangar,
  onOpen
}: {
  row: HangarMachineRowModel
  busy: string | undefined
  hangar: ReturnType<typeof useHangarMachines>
  onOpen: (hostId: string) => void
}) {
  const { machine, orcaCapable, hostId } = row
  const state = machine.state
  const actions = hangarMachineActions(state)
  return (
    <View style={styles.machine}>
      <View style={styles.machineHeader}>
        <Text style={styles.machineName}>{machine.name}</Text>
        <Text style={styles.meta}>{busy ?? state}</Text>
      </View>
      <Text style={styles.meta}>
        {machine.template.id} · {machine.spec.vcpus} vCPU · {Math.round(machine.spec.memMiB / 1024)}{' '}
        GiB
        {orcaCapable ? '' : ' · no Orca'}
      </Text>
      {busy ? (
        <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
      ) : (
        <View style={styles.actions}>
          {actions.includes('start') && (
            <Button label="Start" onPress={() => void hangar.act(machine, 'start', 'Starting…')} />
          )}
          {actions.includes('resume') && (
            <Button
              label="Resume"
              onPress={() => void hangar.act(machine, 'resume', 'Resuming…')}
            />
          )}
          {actions.includes('suspend') && (
            <Button
              label="Suspend"
              onPress={() => void hangar.act(machine, 'suspend', 'Suspending…')}
            />
          )}
          {actions.includes('stop') && (
            <Button label="Stop" onPress={() => void hangar.act(machine, 'stop', 'Stopping…')} />
          )}
          {state === 'running' &&
            orcaCapable &&
            (hostId ? (
              <Button primary label="Open" onPress={() => onOpen(hostId)} />
            ) : (
              <Button primary label="Add to Orca" onPress={() => void hangar.addToOrca(machine)} />
            ))}
        </View>
      )}
    </View>
  )
}

export function HangarScreen() {
  const router = useRouter()
  const hangar = useHangarMachines()
  const [serverUrl, setServerUrl] = useState('https://')
  const [newName, setNewName] = useState('')
  const templateId = hangar.templates[0]?.id ?? null

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
              style={styles.input}
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
                <MachineRow
                  key={row.machine.id}
                  row={row}
                  busy={hangar.busy[row.machine.id]}
                  hangar={hangar}
                  onOpen={(hostId) => router.push(`/h/${hostId}`)}
                />
              ))
            )}
          </View>
          <View style={[styles.section, styles.createRow]}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={newName}
              onChangeText={(v) => setNewName(v.toLowerCase())}
              placeholder="new-machine"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="New machine name"
            />
            <Button
              label={hangar.busy[`new:${newName}`] ?? 'Create'}
              disabled={
                !templateId ||
                !/^[a-z0-9][a-z0-9-]{0,62}$/.test(newName) ||
                hangar.busy[`new:${newName}`] !== undefined
              }
              onPress={() =>
                templateId && void hangar.create(newName, templateId).then(() => setNewName(''))
              }
            />
          </View>
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
  createRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  machine: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.xs
  },
  machineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  machineName: { fontSize: typography.bodySize, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary },
  code: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm
  },
  error: { color: colors.statusRed, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  spinner: { alignSelf: 'flex-start', marginTop: spacing.xs },
  input: {
    backgroundColor: colors.bgRaised,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.bodySize
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.bgRaised,
    alignItems: 'center'
  },
  buttonPrimary: { backgroundColor: colors.surfaceBright },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
  buttonTextPrimary: { color: colors.bgBase }
})
