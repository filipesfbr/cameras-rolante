import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkToken, makeToken, SESSION_MS } from './session.ts';

const COOKIE = 'admin';
const secret = () => process.env.ADMIN_PASSWORD ?? '';

export async function isAdmin() {
  return checkToken(secret(), (await cookies()).get(COOKIE)?.value);
}

/** O proxy só redireciona por conveniência: Server Action é endpoint público, então toda mutação chama isto. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/login');
}

export async function startSession() {
  (await cookies()).set(COOKIE, await makeToken(secret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
