import type { ReactNode } from "react";
import Link from "next/link";

const navigationItems = [
  { href: "/", label: "Dashboard" },
  { href: "/boris-import", label: "BORIS Import" },
  { href: "/dimensions-import", label: "Dimensions Import" },
  { href: "/matching-demo", label: "Matching Demo" },
];

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <main className="admin-shell">
      <aside className="sidebar" aria-label="Dashboard Navigation">
        <Link href="/" className="brand-mark" aria-label="Zur Dashboard-Startseite">
          <span>FE</span><strong>Research Eval</strong>
        </Link>
        <nav>
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>
      </aside>
      <div className="dashboard-main">{children}</div>
    </main>
  );
}
