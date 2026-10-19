import type { Profile } from "@wayline/domain";

/**
 * First 12 hex digits of the SHA-256 of each file in infra/brouter/profiles.
 * Part of every leg cache key. A test fails when a file changes without its
 * hash.
 */
const hashes: Record<Profile, string> = {
  touring: "638cf22d1737",
  fast: "c2e3b1761d6d",
  scenic: "3f2da1c187b0",
  quiet: "07d0e1d6fecc",
};

export function brouterProfileHash(profile: Profile): string {
  return `${profile}-${hashes[profile]}`;
}
