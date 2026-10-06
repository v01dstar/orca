import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { hangarOrcaTemplates, isValidHangarName } from '../../../src/shared/hangar/hangar-api-types'
import { colors, spacing } from '../theme/mobile-theme'
import { HangarButton, hangarInputStyle } from './hangar-button'
import type { HangarMachineSource, useHangarMachines } from './use-hangar-machines'

const sourceKey = (source: HangarMachineSource): string =>
  'imageId' in source ? `image:${source.imageId}` : `template:${source.templateId}`

export function HangarCreateMachine({ hangar }: { hangar: ReturnType<typeof useHangarMachines> }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const sources: { label: string; a11y: string; source: HangarMachineSource }[] = [
    ...hangarOrcaTemplates(hangar.templates).map((t) => ({
      label: `${t.id} template`,
      a11y: `Create from the ${t.id} template`,
      source: { templateId: t.id }
    })),
    ...hangar.images.map((image) => ({
      label: image.name,
      a11y: `Create from image ${image.name}`,
      source: { imageId: image.id }
    }))
  ]
  // Default to the first source until one is picked (or the picked one disappears).
  const selected = sources.find((s) => sourceKey(s.source) === picked) ?? sources[0]
  const busyLabel = hangar.busy[`new:${name}`]
  return (
    <View style={styles.section}>
      {sources.length > 1 ? (
        <>
          <Text style={styles.meta}>Create from</Text>
          <View style={styles.sources}>
            {sources.map((s) => (
              <HangarButton
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
          style={[hangarInputStyle, styles.flex]}
          value={name}
          onChangeText={(v) => setName(v.toLowerCase())}
          placeholder="new-machine"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="New machine name"
        />
        <HangarButton
          label={busyLabel ?? 'Create'}
          disabled={!selected || !isValidHangarName(name) || busyLabel !== undefined}
          onPress={() =>
            selected && void hangar.create(name, selected.source).then(() => setName(''))
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
