import { Pressable, StyleSheet, Text } from 'react-native'
import { colors, spacing, typography } from '../theme/mobile-theme'

export function HangarButton({
  label,
  onPress,
  primary,
  disabled,
  selected,
  accessibilityLabel
}: {
  label: string
  onPress: () => void
  primary?: boolean
  disabled?: boolean
  selected?: boolean
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (primary || selected) && styles.buttonPrimary,
        (pressed || disabled) && styles.buttonDim
      ]}
    >
      <Text style={[styles.buttonText, (primary || selected) && styles.buttonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  )
}

export const hangarInputStyle = StyleSheet.create({
  input: {
    backgroundColor: colors.bgRaised,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.bodySize
  }
}).input

const styles = StyleSheet.create({
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
