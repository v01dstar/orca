import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  hangarMachineActions,
  isValidHangarName
} from '../../../src/shared/hangar/hangar-api-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { HangarButton, hangarInputStyle } from './hangar-button'
import type { HangarMachineRowModel, useHangarMachines } from './use-hangar-machines'

export function HangarMachineRow({
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
  // null: the save-image field is closed.
  const [imageName, setImageName] = useState<string | null>(null)
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
      ) : imageName !== null ? (
        <View style={styles.actions}>
          <TextInput
            style={[hangarInputStyle, styles.flex]}
            value={imageName}
            onChangeText={(v) => setImageName(v.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Image name"
          />
          <HangarButton
            primary
            label="Save"
            accessibilityLabel="Save image"
            disabled={!isValidHangarName(imageName)}
            onPress={() => {
              const name = imageName
              setImageName(null)
              void hangar.saveImage(machine, name)
            }}
          />
          <HangarButton label="Cancel" onPress={() => setImageName(null)} />
        </View>
      ) : (
        <View style={styles.actions}>
          {actions.includes('start') && (
            <HangarButton
              label="Start"
              onPress={() => void hangar.act(machine, 'start', 'Starting…')}
            />
          )}
          {actions.includes('resume') && (
            <HangarButton
              label="Resume"
              onPress={() => void hangar.act(machine, 'resume', 'Resuming…')}
            />
          )}
          {actions.includes('suspend') && (
            <HangarButton
              label="Suspend"
              onPress={() => void hangar.act(machine, 'suspend', 'Suspending…')}
            />
          )}
          {actions.includes('stop') && (
            <HangarButton
              label="Stop"
              onPress={() => void hangar.act(machine, 'stop', 'Stopping…')}
            />
          )}
          {/* hangar saves images only from stopped machines (disks, not RAM). */}
          {state === 'stopped' && (
            <HangarButton
              label="Save image"
              onPress={() => setImageName(`${machine.name}-image`.slice(0, 63))}
            />
          )}
          {state === 'running' &&
            orcaCapable &&
            (hostId ? (
              <HangarButton primary label="Open" onPress={() => onOpen(hostId)} />
            ) : (
              <HangarButton
                primary
                label="Add to Orca"
                onPress={() => void hangar.addToOrca(machine)}
              />
            ))}
          <HangarButton
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
                    onPress: () => void hangar.deleteMachine(machine, hostId)
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
