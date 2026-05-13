import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'DTS — Degening the Situation',
  description: 'AI-powered market intelligence across crypto, equities, indexes, commodities, FX.',
};

const NAV = [
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/feeds',      label: 'Feeds' },
  { href: '/analyst',    label: 'Analyst' },
  { href: '/news',       label: 'News' },
  { href: '/alerts',     label: 'Alerts' },
  { href: '/admin',      label: 'Admin' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-panel">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-md bg-accent/20 border border-accent/40 grid place-items-center">
                <span className="text-accent text-sm font-bold mono">D</span>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">DTS</div>
                <div className="text-[10px] text-muted -mt-0.5">Degening the Situation</div>
              </div>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}
                  className="px-3 py-1.5 rounded-md text-sm text-muted hover:text-text hover:bg-panel2">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="text-xs text-muted mono">v0.1</div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="px-5 py-3 text-[11px] text-muted border-t border-border bg-panel">
            DTS is market intelligence and decision support. Not financial advice. All analyses include risk and invalidation. Not a guaranteed trading system.
          </footer>
        </div>
      </body>
    </html>
  );
}
