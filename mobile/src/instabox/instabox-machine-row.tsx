import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  instaboxMachineActions,
  isValidInstaboxName
} from '../../../src/shared/instabox/instabox-api-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { InstaboxButton, instaboxInputStyle } from './instabox-button'
import type { InstaboxMachineRowModel, useInstaboxMachines } from './use-instabox-machines'

export function InstaboxMachineRow({
  row,
  busy,
  instabox,
  onOpen
}: {
  row: InstaboxMachineRowModel
  busy: string | undefined
  instabox: ReturnType<typeof useInstaboxMachines>
  onOpen: (hostId: string) => void
}) {
  const { machine, orcaCapable, hostId } = row
  const state = machine.state
  const actions = instaboxMachineActions(state)
  // null: the save-snapshot field is closed.
  const [snapshotName, setSnapshotName] = useState<string | null>(null)
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
      ) : snapshotName !== null ? (
        <View style={styles.actions}>
          <TextInput
            style={[instaboxInputStyle, styles.flex]}
            value={snapshotName}
            onChangeText={(v) => setSnapshotName(v.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Snapshot name"
          />
          <InstaboxButton
            primary
            label="Save"
            accessibilityLabel="Save snapshot"
            disabled={!isValidInstaboxName(snapshotName)}
            onPress={() => {
              const name = snapshotName
              setSnapshotName(null)
              void instabox.saveSnapshot(machine, name)
            }}
          />
          <InstaboxButton label="Cancel" onPress={() => setSnapshotName(null)} />
        </View>
      ) : (
        <View style={styles.actions}>
          {actions.includes('start') && (
            <InstaboxButton
              label="Start"
              onPress={() => void instabox.act(machine, 'start', 'Starting…')}
            />
          )}
          {actions.includes('resume') && (
            <InstaboxButton
              label="Resume"
              onPress={() => void instabox.act(machine, 'resume', 'Resuming…')}
            />
          )}
          {actions.includes('suspend') && (
            <InstaboxButton
              label="Suspend"
              onPress={() => void instabox.act(machine, 'suspend', 'Suspending…')}
            />
          )}
          {actions.includes('stop') && (
            <InstaboxButton
              label="Stop"
              onPress={() => void instabox.act(machine, 'stop', 'Stopping…')}
            />
          )}
          {/* instabox saves snapshots only from stopped machines (disks, not RAM). */}
          {state === 'stopped' && (
            <InstaboxButton
              label="Save snapshot"
              onPress={() => setSnapshotName(`${machine.name}-snapshot`.slice(0, 63))}
            />
          )}
          {state === 'running' &&
            orcaCapable &&
            (hostId ? (
              <InstaboxButton primary label="Open" onPress={() => onOpen(hostId)} />
            ) : (
              <InstaboxButton
                primary
                label="Add to Orca"
                onPress={() => void instabox.addToOrca(machine)}
              />
            ))}
          <InstaboxButton
            destructive
            label="Delete"
            accessibilityLabel={`Delete ${machine.name}`}
            onPress={() =>
              Alert.alert(
                `Delete ${machine.name}?`,
                'Deletes the machine with its root and /data disks, and every workspace on it. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void instabox.deleteMachine(machine, hostId)
                  }
                ]
              )
            }
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  machine: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.xs
  },
  machineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  machineName: { fontSize: typography.bodySize, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  flex: { flex: 1, minWidth: 120 },
  spinner: { alignSelf: 'flex-start', marginTop: spacing.xs }
})
