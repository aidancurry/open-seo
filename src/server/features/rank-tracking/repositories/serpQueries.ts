import { and, asc, count, desc, eq, exists, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns, rankSerpResults, rankSnapshots } from "@/db/schema";

type Device = "desktop" | "mobile";

/**
 * Completed full (non-subset) runs of a config that stored their SERP, newest
 * first. Runs from before full-SERP storage have no rows and are skipped.
 */
export async function getSerpRunsForConfig(configId: string, limit: number) {
  return db
    .select({ id: rankCheckRuns.id, startedAt: rankCheckRuns.startedAt })
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        eq(rankCheckRuns.status, "completed"),
        eq(rankCheckRuns.isSubsetRun, false),
        exists(
          db
            .select({ runId: rankSerpResults.runId })
            .from(rankSerpResults)
            .where(eq(rankSerpResults.runId, rankCheckRuns.id)),
        ),
      ),
    )
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(limit);
}

/**
 * Per-domain stats for one run and device. A domain with several URLs on one
 * SERP counts once per keyword, at its best position.
 */
function domainStatsForRun(runId: string, device: Device, alias: string) {
  const best = db
    .select({
      domain: rankSerpResults.domain,
      trackingKeywordId: rankSerpResults.trackingKeywordId,
      bestPosition: min(rankSerpResults.position).as("best_position"),
    })
    .from(rankSerpResults)
    .where(
      and(eq(rankSerpResults.runId, runId), eq(rankSerpResults.device, device)),
    )
    .groupBy(rankSerpResults.domain, rankSerpResults.trackingKeywordId)
    .as(`${alias}_best`);

  return db
    .select({
      domain: best.domain,
      keywords: count().as(`${alias}_keywords`),
      top3: sql<number>`sum(case when ${best.bestPosition} <= 3 then 1 else 0 end)`.as(
        `${alias}_top3`,
      ),
      top10:
        sql<number>`sum(case when ${best.bestPosition} <= 10 then 1 else 0 end)`.as(
          `${alias}_top10`,
        ),
      avgPosition: sql<number>`avg(${best.bestPosition})`.as(
        `${alias}_avg_position`,
      ),
    })
    .from(best)
    .groupBy(best.domain)
    .as(alias);
}

/**
 * Domain leaderboard for a run, joined to the same domains' stats in the
 * previous run. The tracked domain (and its subdomains) sort first so the
 * limit never drops it; callers re-sort for display.
 */
export async function getCompetitorDomains(input: {
  runId: string;
  previousRunId: string | null;
  device: Device;
  ownDomain: string;
  limit: number;
}) {
  const current = domainStatsForRun(input.runId, input.device, "current");
  // No run has an empty id, so without a previous run the join matches
  // nothing and the previous columns come back null.
  const previous = domainStatsForRun(
    input.previousRunId ?? "",
    input.device,
    "previous",
  );
  const ownDomain = input.ownDomain.toLowerCase();

  return db
    .select({
      domain: current.domain,
      keywords: current.keywords,
      top3: current.top3,
      top10: current.top10,
      avgPosition: current.avgPosition,
      previousKeywords: previous.keywords,
      previousTop10: previous.top10,
      previousAvgPosition: previous.avgPosition,
    })
    .from(current)
    .leftJoin(previous, eq(current.domain, previous.domain))
    .orderBy(
      desc(
        sql`case when ${current.domain} = ${ownDomain} or ${current.domain} like ${`%.${ownDomain}`} then 1 else 0 end`,
      ),
      desc(current.top10),
      desc(current.keywords),
      asc(current.avgPosition),
      asc(current.domain),
    )
    .limit(input.limit);
}

export async function countSerpDomains(runId: string, device: Device) {
  const rows = await db
    .select({
      value: sql<number>`count(distinct ${rankSerpResults.domain})`,
    })
    .from(rankSerpResults)
    .where(
      and(eq(rankSerpResults.runId, runId), eq(rankSerpResults.device, device)),
    );
  return Number(rows[0]?.value ?? 0);
}

/**
 * The run's keywords for one device, with the tracked domain's position and
 * the domain holding #1.
 */
export async function getRunKeywordsWithLeader(runId: string, device: Device) {
  const [keywords, leaders] = await Promise.all([
    db
      .select({
        trackingKeywordId: rankSnapshots.trackingKeywordId,
        keyword: rankSnapshots.keyword,
        position: rankSnapshots.position,
      })
      .from(rankSnapshots)
      .where(
        and(eq(rankSnapshots.runId, runId), eq(rankSnapshots.device, device)),
      )
      .orderBy(asc(rankSnapshots.keyword)),
    db
      .select({
        trackingKeywordId: rankSerpResults.trackingKeywordId,
        domain: rankSerpResults.domain,
      })
      .from(rankSerpResults)
      .where(
        and(
          eq(rankSerpResults.runId, runId),
          eq(rankSerpResults.device, device),
          eq(rankSerpResults.position, 1),
        ),
      ),
  ]);
  const leaderByKeyword = new Map(
    leaders.map((row) => [row.trackingKeywordId, row.domain]),
  );
  return keywords.map((row) => ({
    ...row,
    topDomain: leaderByKeyword.get(row.trackingKeywordId) ?? null,
  }));
}

/** One keyword's stored SERP, scoped to the config through its run. */
export async function getKeywordSerp(input: {
  configId: string;
  runId: string;
  trackingKeywordId: string;
  device: Device;
}) {
  return db
    .select({
      position: rankSerpResults.position,
      domain: rankSerpResults.domain,
      url: rankSerpResults.url,
    })
    .from(rankSerpResults)
    .innerJoin(rankCheckRuns, eq(rankSerpResults.runId, rankCheckRuns.id))
    .where(
      and(
        eq(rankCheckRuns.configId, input.configId),
        eq(rankSerpResults.runId, input.runId),
        eq(rankSerpResults.trackingKeywordId, input.trackingKeywordId),
        eq(rankSerpResults.device, input.device),
      ),
    )
    .orderBy(asc(rankSerpResults.position));
}
