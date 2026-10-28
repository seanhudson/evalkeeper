import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evalkeeper example",
  description: "Evals for the AI features in your app.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/evals" className="font-semibold">
              Evalkeeper
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/evals">Evals</Link>
              <Link href="/evals/feedback">Feedback</Link>
              <Link href="/try">Rate an answer</Link>
            </nav>
            <span className="ml-auto text-sm text-muted">Example app</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
