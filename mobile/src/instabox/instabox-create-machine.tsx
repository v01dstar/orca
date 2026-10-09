import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import {
  instaboxOrcaTemplates,
  isValidInstaboxName
} from '../../../src/shared/instabox/instabox-api-types'
import { colors, spacing } from '../theme/mobile-theme'
import { InstaboxButton, instaboxInputStyle } from './instabox-button'
import type { InstaboxMachineSource, useInstaboxMachines } from './use-instabox-machines'

const sourceKey = (source: InstaboxMachineSource): string =>
  'snapshotId' in source ? `snapshot:${source.snapshotId}` : `template:${source.templateId}`

export function InstaboxCreateMachine({
  instabox
}: {
  instabox: ReturnType<typeof useInstaboxMachines>
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const sources: { label: string; a11y: string; source: InstaboxMachineSource }[] = [
    ...instaboxOrcaTemplates(instabox.templates).map((t) => ({
      label: `${t.id} template`,
      a11y: `Create from the ${t.id} template`,
      source: { templateId: t.id }
    })),
    ...instabox.snapshots.map((snapshot) => ({
      label: snapshot.name,
      a11y: `Create from snapshot ${snapshot.name}`,
      source: { snapshotId: snapshot.id }
    }))
  ]
  // Default to the first source until one is picked (or the picked one disappears).
  const selected = sources.find((s) => sourceKey(s.source) === picked) ?? sources[0]
  const busyLabel = instabox.busy[`new:${name}`]
  return (
    <View style={styles.section}>
      {sources.length > 1 ? (
        <>
          <Text style={styles.meta}>Create from</Text>
          <View style={styles.sources}>
            {sources.map((s) => (
              <InstaboxButton
                key={sourceKey(s.source)}
                label={s.label}
                accessibilityLabel={s.a11y}
                selected={selected === s}
                onPress={() => setPicked(sourceKey(s.source))}
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.createRow}>
        <TextInput
          style={[instaboxInputStyle, styles.flex]}
          value={name}
          onChangeText={(v) => setName(v.toLowerCase())}
          placeholder="new-machine"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="New machine name"
        />
        <InstaboxButton
          label={busyLabel ?? 'Create'}
          disabled={!selected || !isValidInstaboxName(name) || busyLabel !== undefined}
          onPress={() =>
            selected && void instabox.create(name, selected.source).then(() => setName(''))
          }
        />
      </View>
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
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 }
})
