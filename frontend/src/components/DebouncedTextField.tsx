import { memo, useEffect, useRef, useState } from 'react'
import { TextField } from '@mui/material'
import type { TextFieldProps } from '@mui/material'

/**
 * A TextField that holds its own local state so typing doesn't re-render the
 * whole parent table on every keystroke. Changes propagate to the parent only
 * on blur, which pairs well with an optimistic PUT-per-edit update pattern.
 */
function DebouncedTextFieldInner({ value: externalValue, onChange, ...rest }: TextFieldProps) {
  const [localValue, setLocalValue] = useState(externalValue ?? '')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Re-sync when the parent value changes (load, optimistic revert, etc.)
  useEffect(() => {
    setLocalValue(externalValue ?? '')
  }, [externalValue])

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (localValue !== externalValue && onChangeRef.current) {
      onChangeRef.current({ target: { value: localValue } } as React.ChangeEvent<HTMLInputElement>)
    }
    rest.onBlur?.(e)
  }

  return (
    <TextField
      {...rest}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
    />
  )
}

export default memo(DebouncedTextFieldInner)
