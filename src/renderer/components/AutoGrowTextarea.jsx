import React, { useRef, useLayoutEffect } from 'react'

export default function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
  style,
  minRows = 3,
  maxHeight = 400,
  ...rest
}) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = next + 'px'
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, maxHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      style={{
        resize: 'none',
        width: '100%',
        minHeight: minRows * 22 + 'px',
        overflowY: 'hidden',
        ...style,
      }}
      {...rest}
    />
  )
}
