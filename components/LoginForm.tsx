'use client';

import { useActionState } from 'react';
import { login } from '@/app/admin/actions';
import s from './Admin.module.css';

export default function LoginForm() {
  const [, action, pending] = useActionState(login, null);
  return (
    <div className={s.page}>
      <div className={s.gateWrap}>
        <form action={action} className={s.gate}>
          <input type="password" name="password" aria-label="senha" autoComplete="current-password" autoFocus className={s.input} />
          <button type="submit" disabled={pending} aria-label="entrar" className={s.btn}>
            {pending ? '…' : '→'}
          </button>
        </form>
      </div>
    </div>
  );
}
