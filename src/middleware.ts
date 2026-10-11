import { clerkMiddleware } from "@clerk/nextjs/server";

// Authorization lives in each resource: seller APIs use requireSeller(),
// admin uses requireAdmin(), and buyer routes validate their own capability.
export default clerkMiddleware({
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.[\\w]+$).*)",
    "/(api|trpc)(.*)",
  ],
};
