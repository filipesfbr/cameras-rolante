'use client';

import { useActionState } from 'react';
import { login } from '@/app/admin/actions';
import s from './Admin.module.css';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Rolante — Admin</h1>
          <div className={s.sub}>Câmeras e histórico</div>
        </div>
        <a href="/">← ver página pública</a>
      </header>
      <div className={s.gateWrap}>
        <form action={action} className={s.gate}>
          <div className={s.gateTitle}>Acesso restrito</div>
          <input type="password" name="password" placeholder="senha" autoComplete="current-password" autoFocus required className={s.input} />
          <button type="submit" disabled={pending} className={s.btn}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
          {error && <div className={`${s.msg} ${s.bad}`}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
