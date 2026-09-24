import React, { useCallback, useLayoutEffect, useRef } from 'react';

/** Grows with content; preserves newlines and does not trim user input. */
export default function AutoResizeTextarea({ value, onChange, className = '', minRows = 2, ...rest }) {
  const ref = useRef(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`;
  }, [minRows]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e);
        resize();
      }}
      rows={minRows}
      className={className + ' resize-y overflow-hidden min-h-[3rem]'}
      {...rest}
    />
  );
}
