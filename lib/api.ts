// Tiny helpers shared by route handlers.
import { NextResponse } from 'next/server';

type ErrorCode =
  | 'PROVIDER_DOWN' | 'ASSET_NOT_FOUND' | 'RATE_LIMITED'
  | 'BAD_REQUEST'   | 'UNAUTHORIZED'     | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  PROVIDER_DOWN: 502, ASSET_NOT_FOUND: 404, RATE_LIMITED: 429,
  BAD_REQUEST: 400,    UNAUTHORIZED: 401,    INTERNAL: 500,
};

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function err(code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: STATUS[code] });
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number; page: number } {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page };
}
