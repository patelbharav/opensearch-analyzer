/**
 * Creates a few test indices on a real OpenSearch domain so the diagnostics
 * have something to flag. SAFE: indices are prefixed with `osa-test-` so the
 * cleanup script can remove them unambiguously, and they contain no real data.
 *
 * Usage:
 *   npx tsx apps/api/scripts/seed-test-data.ts <domainId>
 *
 * What it creates:
 *   osa-test-fixme-too-many-replicas   replicas=99   -> misconfigured-replicas (apiCall fix)
 *   osa-test-fixme-no-replicas         replicas=0    -> misconfigured-replicas (apiCall fix)
 */
import { getDomain } from "../src/persistence/dynamo.js";
import { buildTarget } from "../src/opensearch/target.js";

const PREFIX = "osa-test-fixme-";

async function main() {
  const domainId = process.argv[2];
  if (!domainId) {
    console.error("usage: seed-test-data.ts <domainId>");
    process.exit(1);
  }

  const domain = await getDomain(domainId);
  if (!domain) {
    console.error(`Domain ${domainId} not found in DynamoDB`);
    process.exit(1);
  }

  const target = await buildTarget({ domain });
  console.log(`Seeding test data on ${domain.name} (${domain.endpoint})...`);

  const indices = [
    {
      name: `${PREFIX}too-many-replicas`,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 99, // intentionally absurd → triggers misconfigured-replicas
      },
    },
    {
      name: `${PREFIX}no-replicas`,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0, // → triggers the medium-severity zero-replica finding
      },
    },
  ];

  for (const idx of indices) {
    try {
      // Delete first so re-running is idempotent.
      await target.client.indices.delete({ index: idx.name }).catch(() => undefined);

      const res = await target.client.indices.create({
        index: idx.name,
        body: { settings: idx.settings },
      });
      console.log(`  ✓ created ${idx.name} (replicas=${idx.settings.number_of_replicas})`, res.statusCode);
    } catch (err) {
      const meta = (err as { meta?: { statusCode?: number; body?: unknown } }).meta;
      console.error(`  ✗ failed for ${idx.name}: status=${meta?.statusCode}`, meta?.body ?? err);
    }
  }

  console.log("\nDone. Now in the UI:");
  console.log("  1. Open http://localhost:5173/findings");
  console.log("  2. Click 'Scan now'");
  console.log("  3. Expand a 'misconfigured-replicas' finding -> click 'Apply fix'");
  console.log("\nTo clean up afterwards:");
  console.log(`  npx tsx apps/api/scripts/cleanup-test-data.ts ${domainId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
