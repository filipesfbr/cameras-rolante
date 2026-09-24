import type { Metadata } from 'next';
import AdminPanel from '@/components/AdminPanel';
import { requireAdmin } from '@/lib/auth';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rolante — Admin', robots: { index: false } };

export default async function AdminPage() {
  await requireAdmin();
  return <AdminPanel config={await readConfig()} />;
}
