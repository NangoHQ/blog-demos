/**
 * The current Lumin user — the *product's* own account, distinct from the
 * Notion workspace they connect via Nango. Hard-coded because auth for the
 * product itself is out of scope for this demo.
 */
export const appUser = {
  name: "Mara Ellis",
  email: "mara@lumin.app",
  workspace: "Lumin",
  role: "Editor",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
