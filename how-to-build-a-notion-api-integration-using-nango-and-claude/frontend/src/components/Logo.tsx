/** The wordmark: the light-burst tile + a serif logotype. */
export function Logo({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.svg" alt="" className="size-8 shrink-0 rounded-lg" />
      {showWordmark && (
        <span className="font-display text-[1.35rem] leading-none font-semibold tracking-tight text-stone-900">
          Nango Demo
        </span>
      )}
    </div>
  );
}
