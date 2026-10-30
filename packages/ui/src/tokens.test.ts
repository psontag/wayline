/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

type Theme = "light" | "dark";

function readBlock(start: string): Map<string, string> {
  const from = css.indexOf(start);
  if (from < 0) throw new Error(`Missing block ${start}`);
  const block = css.slice(from, css.indexOf("}", from));
  const tokens = new Map<string, string>();
  for (const [, name = "", value = ""] of block.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g,
  )) {
    tokens.set(name, value);
  }
  return tokens;
}

function readColors(): Record<Theme, Map<string, string>> {
  return {
    light: readBlock('[data-theme="light"] {'),
    dark: readBlock('[data-theme="dark"] {'),
  };
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

const routeColors = [
  "route-best",
  "route-nature",
  "route-flat",
  "route-hilly",
  "route-sights",
] as const;

const colors = readColors();

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  const tokens = colors[theme];

  it.each(textPairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    const ratio = contrast(get(tokens, fg), get(tokens, bg));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(routeColors)("on-route on %s is at least 4.5:1", (route) => {
    const ratio = contrast(get(tokens, "on-route"), get(tokens, route));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring on bg is at least 3:1", () => {
    expect(
      contrast(get(tokens, "focus-ring"), get(tokens, "bg")),
    ).toBeGreaterThanOrEqual(3);
  });
});
