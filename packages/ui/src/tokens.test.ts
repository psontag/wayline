/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

type Theme = "light" | "dark";

function readColors(): Record<Theme, Map<string, string>> {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  const pattern =
    /--color-([a-z-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g;
  for (const [, name = "", l = "", d = ""] of css.matchAll(pattern)) {
    light.set(name, l);
    dark.set(name, d);
  }
  return { light, dark };
}

function get(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing color token ${name}`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const textPairs = [
  ["text", "bg"],
  ["text-muted", "bg"],
  ["text", "surface"],
  ["text-muted", "surface"],
  ["text", "surface-raised"],
  ["text-muted", "surface-raised"],
  ["on-accent", "accent"],
  ["on-inverse", "inverse"],
] as const;

const colors = readColors();

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  const tokens = colors[theme];

  it.each(textPairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    const ratio = contrast(get(tokens, fg), get(tokens, bg));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring on bg is at least 3:1", () => {
    expect(
      contrast(get(tokens, "focus-ring"), get(tokens, "bg")),
    ).toBeGreaterThanOrEqual(3);
  });
});
