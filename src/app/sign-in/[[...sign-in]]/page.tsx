"use client";
import { CommerceHeader } from "@/components/shared/CommerceHeader";

import { SignIn } from "@clerk/nextjs";

/**
 * Clerk handles authentication; the surrounding shell matches RouteFlow.
 */
export default function SignInPage() {
  return (
    <>
      <CommerceHeader />
      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-brand-bg px-4 py-10">
        <SignIn
          appearance={{
            elements: {
              primaryButton: { backgroundColor: "var(--color-accent-700)" },
              cardBox: "rounded-lg shadow-none border border-slate-200",
            },
          }}
        />
      </main>
    </>
  );
}
