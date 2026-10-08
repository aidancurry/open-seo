import { beforeAll, describe, expect, it, vi } from "vitest";
import type { executeInBatches } from "@/db/runBatch";
import { RankTrackingRepository } from "../repositories/RankTrackingRepository";
import { getCompetitorOverview } from "./rankTrackingCompetitors";

// Every production migration applied to in-memory SQLite, so the competitor
// queries run against the real table, indexes and conflict target.
const { testDb } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return { testDb: await createAiVisibilityTestDb() };
});
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({
  DB_BATCH_SIZE: 100,
  executeInBatches: (async (items, build) => {
    await testDb.runBatch((tx) => items.map((item) => build(tx, item)));
  }) satisfies typeof executeInBatches,
}));

type SerpRow = [keywordId: string, position: number, domain: string];

async function seedRun(runId: string, startedAt: string, serp: SerpRow[]) {
  await testDb.client.execute({
    sql: `INSERT INTO rank_check_runs (id, config_id, project_id, status, started_at)
      VALUES (?, 'config', 'project', 'completed', ?)`,
    args: [runId, startedAt],
  });
  const keywordIds = [...new Set(serp.map(([keywordId]) => keywordId))];
  await RankTrackingRepository.insertSnapshots(
    keywordIds.map((keywordId) => ({
      runId,
      trackingKeywordId: keywordId,
      keyword: keywordId,
      device: "desktop",
      position:
        serp.find(
          ([id, , domain]) => id === keywordId && domain === "example.com",
        )?.[1] ?? null,
      url: null,
      serpFeatures: null,
    })),
  );
  const rows = serp.map(([keywordId, position, domain]) => ({
    runId,
    trackingKeywordId: keywordId,
    keyword: keywordId,
    device: "desktop" as const,
    position,
    domain,
    url: `https://${domain}/${keywordId}`,
  }));
  await RankTrackingRepository.insertSerpResults(rows);
  return rows;
}

beforeAll(async () => {
  await testDb.seedProject();
  await testDb.client.execute(
    `INSERT INTO rank_tracking_configs (id, project_id, domain, serp_depth)
      VALUES ('config', 'project', 'example.com', 20)`,
  );
  await seedRun("old", "2026-10-01 06:00:00", [
    ["kw1", 1, "rival.com"],
    ["kw2", 5, "rival.com"],
  ]);
  const latest = await seedRun("new", "2026-10-08 06:00:00", [
    ["kw1", 1, "rival.com"],
    ["kw1", 2, "rival.com"],
    ["kw1", 3, "blog.example.com"],
    ["kw2", 1, "example.com"],
    ["kw2", 12, "rival.com"],
  ]);
  // A retried collect step writes the same SERP again.
  await RankTrackingRepository.insertSerpResults(latest);
});

describe("rank tracking competitors", () => {
  it("counts each domain once per keyword at its best position and compares with the previous run", async () => {
    const overview = await getCompetitorOverview({
      configId: "config",
      projectId: "project",
      device: "desktop",
    });

    expect(overview).toMatchObject({
      runs: [{ id: "new" }, { id: "old" }],
      runId: "new",
      previousRunId: "old",
      totalDomains: 3,
      keywords: [
        { trackingKeywordId: "kw1", position: null, topDomain: "rival.com" },
        { trackingKeywordId: "kw2", position: 1, topDomain: "example.com" },
      ],
    });
    expect(
      Object.fromEntries(overview.domains.map((row) => [row.domain, row])),
    ).toEqual({
      "rival.com": {
        domain: "rival.com",
        isOwn: false,
        keywords: 2,
        top3: 1,
        top10: 1,
        avgPosition: 6.5,
        previousTop10: 2,
        previousAvgPosition: 3,
      },
      "example.com": {
        domain: "example.com",
        isOwn: true,
        keywords: 1,
        top3: 1,
        top10: 1,
        avgPosition: 1,
        previousTop10: null,
        previousAvgPosition: null,
      },
      "blog.example.com": {
        domain: "blog.example.com",
        isOwn: true,
        keywords: 1,
        top3: 1,
        top10: 1,
        avgPosition: 3,
        previousTop10: null,
        previousAvgPosition: null,
      },
    });
  });

  it("returns a keyword's stored SERP once, in position order, only within its config", async () => {
    const serp = (configId: string) =>
      RankTrackingRepository.getKeywordSerp({
        configId,
        runId: "new",
        trackingKeywordId: "kw1",
        device: "desktop",
      });

    expect((await serp("config")).map((row) => row.position)).toEqual([
      1, 2, 3,
    ]);
    expect(await serp("other-config")).toEqual([]);
  });
});
