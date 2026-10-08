import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";

type Device = "desktop" | "mobile";

/** Runs offered in the run picker. */
const RUN_OPTIONS_LIMIT = 26;

/** Domains returned per run; the tracked domain is always included. */
const DOMAIN_LIMIT = 200;

export interface RankCompetitorDomain {
  domain: string;
  isOwn: boolean;
  /** Keywords the domain ranks for anywhere in the crawled depth. */
  keywords: number;
  top3: number;
  top10: number;
  avgPosition: number;
  /** Null when the domain did not rank in the previous run (or there is none). */
  previousTop10: number | null;
  previousAvgPosition: number | null;
}

export interface RankCompetitorKeyword {
  trackingKeywordId: string;
  keyword: string;
  position: number | null;
  topDomain: string | null;
}

interface RankCompetitorOverview {
  runs: { id: string; startedAt: string }[];
  runId: string | null;
  previousRunId: string | null;
  domains: RankCompetitorDomain[];
  totalDomains: number;
  keywords: RankCompetitorKeyword[];
}

function isOwnDomain(domain: string, ownDomain: string) {
  const own = ownDomain.toLowerCase();
  return domain === own || domain.endsWith(`.${own}`);
}

/** Postgres returns sum/avg/count as strings; SQLite as numbers. */
function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function getCompetitorOverview(input: {
  configId: string;
  projectId: string;
  device: Device;
  runId?: string;
}): Promise<RankCompetitorOverview> {
  const config = await RankTrackingRepository.getConfigById({
    configId: input.configId,
    projectId: input.projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }

  const runs = await RankTrackingRepository.getSerpRunsForConfig(
    config.id,
    RUN_OPTIONS_LIMIT,
  );
  const requestedIndex = input.runId
    ? runs.findIndex((run) => run.id === input.runId)
    : 0;
  const runIndex = Math.max(0, requestedIndex);
  const run = runs[runIndex];
  if (!run) {
    return {
      runs,
      runId: null,
      previousRunId: null,
      domains: [],
      totalDomains: 0,
      keywords: [],
    };
  }
  const previousRunId = runs[runIndex + 1]?.id ?? null;

  const [domainRows, totalDomains, keywords] = await Promise.all([
    RankTrackingRepository.getCompetitorDomains({
      runId: run.id,
      previousRunId,
      device: input.device,
      ownDomain: config.domain,
      limit: DOMAIN_LIMIT,
    }),
    RankTrackingRepository.countSerpDomains(run.id, input.device),
    RankTrackingRepository.getRunKeywordsWithLeader(run.id, input.device),
  ]);

  return {
    runs,
    runId: run.id,
    previousRunId,
    domains: domainRows.map((row) => ({
      domain: row.domain,
      isOwn: isOwnDomain(row.domain, config.domain),
      keywords: Number(row.keywords),
      top3: Number(row.top3),
      top10: Number(row.top10),
      avgPosition: Number(row.avgPosition),
      previousTop10:
        row.previousKeywords === null ? null : Number(row.previousTop10),
      previousAvgPosition: toNumberOrNull(row.previousAvgPosition),
    })),
    totalDomains,
    keywords,
  };
}
