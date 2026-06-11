import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ options, label, ...props }) => {
  return (
    <div>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: '6px',
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--ink)',
            cursor: 'pointer',
            appearance: 'none',
            paddingRight: '28px',
          }}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--muted)',
          }}
        />
      </div>
    </div>
  );
};
