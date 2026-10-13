import React from 'react';

// Textarea that grows with its content (so pasting a long note isn't cramped in a
// small fixed box) up to a max height, after which it scrolls. Resizes on value
// change — which also covers paste — and on mount. Drop-in replacement for a
// <textarea>: pass `value`, `onChange`, `className`, and any other textarea props.
export default function AutoTextarea({ value, onChange, minRows = 2, maxHeight = 260, className, ...props }) {
  const ref = React.useRef(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  };
  React.useEffect(() => { fit(); }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => { onChange?.(e); fit(); }}
      style={{ maxHeight, overflowY: 'auto', resize: 'none' }}
      className={className}
      {...props}
    />
  );
}
