/** Approved Encuentro symbol. Inherits colour from the surrounding wordmark. */
export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d="M18 24h28c18 0 28 10 28 28v8H58v-8c0-8-4-12-12-12H18Z" fill="currentColor" />
      <path d="M78 72H50c-18 0-28-10-28-28v-8h16v8c0 8 4 12 12 12h28Z" fill="currentColor" />
    </svg>
  );
}
