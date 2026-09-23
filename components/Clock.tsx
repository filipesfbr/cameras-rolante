'use client';

import { useEffect, useState } from 'react';
import s from './Clock.module.css';

const p = (n: number) => String(n).padStart(2, '0');

export default function Clock() {
  const [text, setText] = useState('--/--/---- --:--:--'); // só preenche no cliente: evita hydration mismatch
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setText(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} - ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className={s.time}>{text}</div>
  );
}
