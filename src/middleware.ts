import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes. The Marketplace (buyer) is public, and the home page (/) can be public.
// If there are subroutes like /buyer or /seller, we handle them.
const isPublicRoute = createRouteMatcher([
  "/",
  "/buyer(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth: any, request: any) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.[\\w]+$).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
