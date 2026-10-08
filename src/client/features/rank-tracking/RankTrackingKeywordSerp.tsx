import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { QueryState } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { DomainFavicon } from "@/client/features/ai-visibility/DomainFavicon";
import { getRankKeywordSerp } from "@/serverFunctions/rank-tracking";
import type { RankCompetitorKeyword } from "@/server/features/rank-tracking/services/rankTrackingCompetitors";
import { RANK_TRACKING_HEADER_CLASS } from "./RankTrackingColumns";

type Device = "desktop" | "mobile";

/**
 * The run's keywords with the tracked domain's position and the #1 result;
 * each row expands to the keyword's full stored SERP.
 */
export function KeywordSerpTable({
  keywords,
  projectId,
  configId,
  runId,
  device,
  domain,
  serpDepth,
}: {
  keywords: RankCompetitorKeyword[];
  projectId: string;
  configId: string;
  runId: string;
  device: Device;
  domain: string;
  serpDepth: number;
}) {
  const columns = useMemo<ColumnDef<RankCompetitorKeyword>[]>(
    () => [
      {
        id: "expand",
        header: () => <span className="sr-only">Full SERP</span>,
        meta: { headerClassName: "w-10" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={row.getIsExpanded()}
            aria-label={`Show the full SERP for ${row.original.keyword}`}
            onClick={() => row.toggleExpanded()}
          >
            {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ),
      },
      {
        id: "keyword",
        header: () => (
          <span className={RANK_TRACKING_HEADER_CLASS}>Keyword</span>
        ),
        cell: ({ row: { original } }) => (
          <span className="font-medium">{original.keyword}</span>
        ),
      },
      {
        id: "position",
        header: () => (
          <span className={RANK_TRACKING_HEADER_CLASS}>Your position</span>
        ),
        meta: { headerClassName: "w-32", cellClassName: "font-mono text-xs" },
        cell: ({ row: { original } }) =>
          original.position ?? (
            <span className="font-sans text-muted-foreground">
              Not in top {serpDepth}
            </span>
          ),
      },
      {
        id: "topDomain",
        header: () => (
          <span className={RANK_TRACKING_HEADER_CLASS}>#1 result</span>
        ),
        cell: ({ row: { original } }) =>
          original.topDomain ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [serpDepth],
  );
  const table = useDataTable({
    data: keywords,
    columns,
    getRowId: (row) => row.trackingKeywordId,
  });

  return (
    <DataTable
      table={table}
      scrollClassName="max-h-[560px]"
      empty={{
        title: "No keywords in this check",
        description: "This check has no results for this device.",
      }}
      renderExpandedRow={(row) => (
        <KeywordSerp
          projectId={projectId}
          configId={configId}
          runId={runId}
          trackingKeywordId={row.original.trackingKeywordId}
          device={device}
          domain={domain}
        />
      )}
    />
  );
}

function KeywordSerp({
  projectId,
  configId,
  runId,
  trackingKeywordId,
  device,
  domain,
}: {
  projectId: string;
  configId: string;
  runId: string;
  trackingKeywordId: string;
  device: Device;
  domain: string;
}) {
  const query = useQuery({
    queryKey: [
      "rankKeywordSerp",
      projectId,
      configId,
      runId,
      trackingKeywordId,
      device,
    ],
    queryFn: () =>
      getRankKeywordSerp({
        data: { projectId, configId, runId, trackingKeywordId, device },
      }),
  });
  const own = domain.toLowerCase();

  return (
    <div className="py-1 pl-10">
      <QueryState
        query={query}
        errorFallback="Failed to load the SERP"
        loading={<Skeleton className="h-24 w-full" />}
      >
        {(results) =>
          results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No organic results were stored for this keyword.
            </p>
          ) : (
            <ol className="space-y-1">
              {results.map((result) => {
                const isOwn =
                  result.domain === own || result.domain.endsWith(`.${own}`);
                return (
                  <li
                    key={result.position}
                    className={`flex items-center gap-2 rounded px-1 text-sm ${isOwn ? "bg-primary/5 font-medium" : ""}`}
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {result.position}
                    </span>
                    <DomainFavicon domain={result.domain} />
                    <span className="w-48 shrink-0 truncate">
                      {result.domain}
                    </span>
                    {result.url && (
                      <SafeExternalLink
                        url={result.url}
                        label={result.url}
                        className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground hover:underline"
                      />
                    )}
                    {isOwn && (
                      <Badge variant="success" size="sm">
                        You
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          )
        }
      </QueryState>
    </div>
  );
}
