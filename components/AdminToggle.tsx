'use client';

import s from './Admin.module.css';

export default function AdminToggle({
  name,
  checked,
  disabled,
  onChange,
  on,
  off,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  on: string;
  off: string;
}) {
  return (
    <label className={s.toggle}>
      <span className={s.toggleName}>{name}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} />
      <span className={s.track} aria-hidden="true" />
      <span className={s.toggleState}>{checked ? on : off}</span>
    </label>
  );
}
