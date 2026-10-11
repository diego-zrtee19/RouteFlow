"use client";

import { SignUp } from "@clerk/nextjs";

/** Clerk-hosted sign-up surface, paired with `/sign-in`. */
export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
      <SignUp
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