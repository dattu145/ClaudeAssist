// Trivial sanity check, run manually with `node --import tsx scripts/check-env.ts`.
// Grows into real preflight checks in later pages.
const [major] = process.versions.node.split(".").map(Number);

if (major === undefined || major < 20) {
  console.error(`ClaudeOps requires Node 20+, found ${process.versions.node}`);
  process.exit(1);
}

console.log(`Node ${process.versions.node} OK`);
