import { initials } from "../lib/appUser";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
} as const;

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-clay-100 font-semibold text-clay-700 ring-1 ring-clay-200 ring-inset ${SIZES[size]}`}
    >
      {initials(name)}
    </span>
  );
}
