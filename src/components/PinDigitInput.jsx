import React, { useEffect, useRef } from 'react';

export default function PinDigitInput({
  length = 6,
  value = '',
  onChange,
  onComplete,
  masked = false,
  disabled = false,
  autoFocus = false
}) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const triggerChange = (newDigits) => {
    const val = newDigits.join('');
    onChange(val);
    if (val.length === length && newDigits.every(Boolean)) {
      onComplete?.(val);
    }
  };

  const handleChange = (index, char) => {
    const numeric = char.replace(/\D/g, '');
    if (numeric.length > 1) {
      // Pasted content
      const updated = [...digits];
      for (let i = 0; i < numeric.length && index + i < length; i++) {
        updated[index + i] = numeric[i];
      }
      triggerChange(updated);
      const nextIdx = Math.min(index + numeric.length, length - 1);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    if (!/^\d?$/.test(numeric)) return;
    const updated = [...digits];
    updated[index] = numeric;
    triggerChange(updated);

    if (numeric && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex w-full gap-2 sm:justify-center sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="pin-digit min-w-0 flex-1 sm:flex-none"
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
