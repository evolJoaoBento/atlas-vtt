import React from 'react';
import { ObsidianMenuDropdown } from '../../shared/ObsidianMenuDropdown';
import { tokenSizeOptions } from '../../../../i18n/sharedTexts';

const OPTIONS: Record<string, string> = Object.fromEntries(tokenSizeOptions().map(option => [String(option.size), option.label]));

/** Picks the default grid footprint of a token; `value` is the size multiplier, undefined means 1×1. */
export function TokenSizeSelect({ value, onChange, className }: {
  value: number | undefined;
  onChange: (size: number) => void;
  className?: string;
}): React.JSX.Element {
  return <ObsidianMenuDropdown {...(className && { className })} value={String(value ?? 1)} options={OPTIONS} onChange={next => onChange(Number(next))} />;
}
