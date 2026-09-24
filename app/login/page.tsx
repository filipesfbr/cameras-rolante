import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rolante — Admin', robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');
  return <LoginForm />;
}
