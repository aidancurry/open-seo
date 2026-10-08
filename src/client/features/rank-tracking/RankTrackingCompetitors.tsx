import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef, Row, SortingState } from "@tanstack/react-table";
import { QueryState } from "@/client/components/QueryState";
import { SkeletonCard } from "@/client/components/SkeletonPresets";
import { EmptyState } from "@/client/components/EmptyState";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { Badge } from "@/client/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { DomainFavicon } from "@/client/features/ai-visibility/DomainFavicon";
import { getRankCompetitors } from "@/serverFunctions/rank-tracking";
import type { RankCompetitorDomain } from "@/server/features/rank-tracking/services/rankTrackingCompetitors";
import { RANK_TRACKING_HEADER_CLASS } from "./RankTrackingColumns";
import { KeywordSerpTable } from "./RankTrackingKeywordSerp";

type Device = "desktop" | "mobile";

/**
 * Competitor view: every domain in the stored SERPs of one full run, ranked
 * by how many tracked keywords it holds in the top 10, with the change since
 * the run before it. Below, each keyword expands to its full stored SERP.
 */
export function RankTrackingCompetitors({
  projectId,
  configId,
  domain,
  device,
  serpDepth,
}: {
  projectId: string;
  configId: string;
  domain: string;
  device: Device;
  serpDepth: number;
}) {
  const [runId, setRunId] = useState<string | undefined>();
  const query = useQuery({
    queryKey: ["rankCompetitors", projectId, configId, device, runId],
    queryFn: () =>
      getRankCompetitors({ data: { projectId, configId, device, runId } }),
    placeholderData: keepPreviousData,
  });

  return (
    <QueryState
      query={query}
      errorFallback="Failed to load competitor data"
      loading={<SkeletonCard />}
    >
      {(overview) => {
        if (!overview.runId) {
          return (
            <EmptyState
              title="No competitor data yet"
              description="Rank checks now save every organic result on the page. Competitors appear after the next completed check."
            />
          );
        }
        const runItems = overview.runs.map((run) => ({
          value: run.id,
          label: formatRunDate(run.startedAt),
        }));
        const previousRun = overview.runs.find(
          (run) => run.id === overview.previousRunId,
        );
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Check</span>
              <Select
                items={runItems}
                value={overview.runId}
                onValueChange={(value) => {
                  if (typeof value === "string") setRunId(value);
                }}
              >
                <SelectTrigger size="sm" aria-label="Rank check to show">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {runItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>
                {previousRun
                  ? `Changes vs ${formatRunDate(previousRun.startedAt)}`
                  : "No earlier check to compare"}
                {" · "}Top {serpDepth} organic results
              </span>
            </div>

            <CompetitorDomainTable
              domains={overview.domains}
              totalDomains={overview.totalDomains}
              hasPrevious={overview.previousRunId !== null}
            />

            <KeywordSerpTable
              keywords={overview.keywords}
              projectId={projectId}
              configId={configId}
              runId={overview.runId}
              device={device}
              domain={domain}
              serpDepth={serpDepth}
            />
          </div>
        );
      }}
    </QueryState>
  );
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

function CompetitorDomainTable({
  domains,
  totalDomains,
  hasPrevious,
}: {
  domains: RankCompetitorDomain[];
  totalDomains: number;
  hasPrevious: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "top10", desc: true },
  ]);
  const columns = useMemo(() => competitorColumns(hasPrevious), [hasPrevious]);
  const table = useDataTable({
    data: domains,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    withSorting: true,
    getRowId: (row) => row.domain,
  });

  return (
    <DataTable
      table={table}
      scrollClassName="max-h-[480px]"
      empty={{
        title: "No organic results stored",
        description: "This check returned no organic results.",
      }}
      footer={
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {domains.length < totalDomains
            ? `Top ${domains.length} of ${totalDomains} domains by top-10 keywords`
            : `${totalDomains} domains`}
        </p>
      }
    />
  );
}

/** Tints every cell of the tracked domain's rows. */
function ownRowClass(extra?: string) {
  return (row: Row<RankCompetitorDomain>) =>
    [extra, row.original.isOwn ? "bg-primary/5" : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
}

function numberHeader(id: string, label: string, title: string) {
  return {
    id,
    meta: {
      headerClassName: "w-28 text-right",
      cellClassName: ownRowClass("text-right font-mono text-xs"),
    },
    header: ({
      column,
    }: {
      column: Parameters<typeof SortableHeader>[0]["column"];
    }) => (
      <SortableHeader
        column={column}
        label={label}
        title={title}
        align="right"
        className={RANK_TRACKING_HEADER_CLASS}
      />
    ),
  };
}

function competitorColumns(
  hasPrevious: boolean,
): ColumnDef<RankCompetitorDomain>[] {
  return [
    {
      id: "domain",
      accessorKey: "domain",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="Domain"
          className={RANK_TRACKING_HEADER_CLASS}
        />
      ),
      cell: ({ row: { original } }) => (
        <span className="inline-flex items-center gap-2">
          <DomainFavicon domain={original.domain} />
          <span className={original.isOwn ? "font-semibold" : undefined}>
            {original.domain}
          </span>
          {original.isOwn && (
            <Badge variant="success" size="sm">
              You
            </Badge>
          )}
        </span>
      ),
      meta: { cellClassName: ownRowClass() },
    },
    {
      ...numberHeader(
        "keywords",
        "Keywords",
        "Tracked keywords the domain ranks for in the checked depth",
      ),
      accessorKey: "keywords",
      sortDescFirst: true,
    },
    {
      ...numberHeader("top3", "Top 3", "Keywords ranking in positions 1-3"),
      accessorKey: "top3",
      sortDescFirst: true,
    },
    {
      ...numberHeader(
        "top10",
        "Top 10",
        "Keywords ranking in positions 1-10, with the change since the previous check",
      ),
      accessorKey: "top10",
      sortDescFirst: true,
      cell: ({ row: { original } }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <span>{original.top10}</span>
          {hasPrevious && (
            <Change
              value={
                original.previousTop10 === null
                  ? null
                  : original.top10 - original.previousTop10
              }
            />
          )}
        </span>
      ),
    },
    {
      ...numberHeader(
        "avgPosition",
        "Avg. position",
        "Average of the domain's best position per ranking keyword",
      ),
      accessorKey: "avgPosition",
      cell: ({ row: { original } }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <span>{original.avgPosition.toFixed(1)}</span>
          {/* A new domain is already flagged in the Top 10 column. */}
          {original.previousAvgPosition !== null && (
            <Change
              value={
                // A lower position is better, so a drop reads as a gain.
                Math.round(
                  (original.previousAvgPosition - original.avgPosition) * 10,
                ) / 10
              }
            />
          )}
        </span>
      ),
    },
  ];
}

/** A positive value is an improvement; null means new since last check. */
function Change({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <Badge variant="outline" size="sm">
        new
      </Badge>
    );
  }
  if (value > 0) return <span className="text-success">▲{value}</span>;
  if (value < 0) return <span className="text-warning">▼{-value}</span>;
  return null;
}

function formatRunDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
