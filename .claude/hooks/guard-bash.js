// PreToolUse hook for Bash. Enforces the workflow rules in CLAUDE.md.
import { readFileSync } from "node:fs";

const { tool_input: input } = JSON.parse(readFileSync(0, "utf8"));
const command = input?.command ?? "";
// Start of the command or of a part after ;, &&, ||, | or (.
const start = String.raw`(^|[;&|(]\s*|\n\s*)`;

const deny = [
  [
    new RegExp(`${start}(python3?|pip3?)(\\s|$)`),
    "Run Python through uv: `uv run script.py` or `uv run --no-project python -`. In pipeline/: `uv run <script>.py`.",
  ],
  [
    /\bsed\s+(-[a-zA-Z]*i|--in-place)/,
    "Edit files with the Edit tool, not `sed -i`.",
  ],
];

for (const [pattern, reason] of deny) {
  if (pattern.test(command)) answer("deny", reason);
}
if (/\bPROVIDERS=live\b/.test(command)) {
  answer(
    "ask",
    "PROVIDERS=live calls the real APIs. Only use it when the user asked.",
  );
}

function answer(permissionDecision, permissionDecisionReason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason,
      },
    }),
  );
  process.exit(0);
}
