/**
 * Removes any indices created by seed-test-data.ts.
 *
 * Usage:
 *   npx tsx apps/api/scripts/cleanup-test-data.ts <domainId>
 */
import { getDomain } from "../src/persistence/dynamo.js";
import { buildTarget } from "../src/opensearch/target.js";

const PREFIX = "osa-test-fixme-";

async function main() {
  const domainId = process.argv[2];
  if (!domainId) {
    console.error("usage: cleanup-test-data.ts <domainId>");
    process.exit(1);
  }
  const domain = await getDomain(domainId);
  if (!domain) {
    console.error(`Domain ${domainId} not found`);
    process.exit(1);
  }

  const target = await buildTarget({ domain });
  // Wildcard delete — only matches our prefix.
  try {
    const res = await target.client.indices.delete({ index: `${PREFIX}*` });
    console.log("Cleanup status:", res.statusCode, res.body);
  } catch (err) {
    const meta = (err as { meta?: { statusCode?: number; body?: unknown } }).meta;
    if (meta?.statusCode === 404) {
      console.log("No test indices found — already clean.");
      return;
    }
    console.error("Cleanup failed:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
