import { NextResponse, type NextRequest } from 'next/server';
import { checkToken } from './lib/session.ts';

export async function proxy(req: NextRequest) {
  if (await checkToken(process.env.ADMIN_PASSWORD ?? '', req.cookies.get('admin')?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: '/admin/:path*' };
