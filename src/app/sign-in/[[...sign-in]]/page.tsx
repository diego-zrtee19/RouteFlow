"use client";

import { SignIn } from "@clerk/nextjs";

/**
 * Clerk-hosted sign-in surface. The route is intentionally unstyled beyond the
 * RouteFlow brand colour so the approved UI is not altered: the dashboard
 * middleware redirects here whenever a seller is signed out.
 */
export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
      <SignIn
        appearance={{
          elements: {
            primaryButton: { backgroundColor: "#2563EB" },
            cardBox: "rounded-2xl shadow-xs border border-slate-200",
          },
        }}
      />
    </main>
  );
}