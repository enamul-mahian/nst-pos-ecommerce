import React from 'react';

export const digitsOnly = (value) => {
  const raw = String(value ?? '').replace(/\D/g, '');
  if (!raw) return '';
  return raw.replace(/^0+(?=\d)/, '');
};

export const formatBdInteger = (value) => {
  const raw = digitsOnly(value);
  if (!raw) return '';

  if (raw.length <= 3) {
    return raw;
  }

  const lastThree = raw.slice(-3);
  let leading = raw.slice(0, -3);
  const groups = [];

  while (leading.length > 2) {
    groups.unshift(leading.slice(-2));
    leading = leading.slice(0, -2);
  }

  if (leading) {
    groups.unshift(leading);
  }

  return `${groups.join(',')},${lastThree}`;
};

export default function BdMoneyInput({
  value,
  onValueChange,
  onChange,
  name,
  className = '',
  required = false,
  placeholder = '',
  disabled = false,
  readOnly = false,
  autoFocus = false,
  ...rest
}) {
  const formatted = formatBdInteger(value);

  const emit = (raw) => {
    if (typeof onValueChange === 'function') {
      onValueChange(raw);
    }

    if (typeof onChange === 'function') {
      onChange({
        target: {
          name,
          value: raw,
          type: 'text',
        },
      });
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={name}
      value={formatted}
      onChange={(event) => emit(digitsOnly(event.target.value))}
      onPaste={(event) => {
        const text = event.clipboardData?.getData('text') ?? '';
        if (!text) return;
        event.preventDefault();
        emit(digitsOnly(text));
      }}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      autoFocus={autoFocus}
      className={className}
      {...rest}
    />
  );
}
