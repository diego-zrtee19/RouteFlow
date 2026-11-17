"use client";
import { CommerceHeader } from "@/components/shared/CommerceHeader";

import { SignUp } from "@clerk/nextjs";

/** Clerk-hosted sign-up surface, paired with `/sign-in`. */
export default function SignUpPage() {
  return (
    <>
      <CommerceHeader />
      <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-brand-bg px-4 py-10">
        <SignUp
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
