import { useId, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RcTooltip,
  Legend
} from "recharts";

interface ChartSeries {
  name?: string;
  data: (number | string | null)[];
}
interface ChartSpec {
  type: "line" | "bar" | "area" | "pie" | "scatter";
  title?: string;
  x?: (string | number)[];
  series?: ChartSeries[];
}

const PALETTE = ["#9e3ffd", "#7a22d8", "#b57bff", "#5b21b6", "#c084fc", "#8b5cf6"];

function normalize(raw: unknown): ChartSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  const series = Array.isArray(o.series)
    ? (o.series as ChartSeries[]).filter((s) => s && Array.isArray(s.data))
    : undefined;
  const spec: ChartSpec = {
    type: o.type as ChartSpec["type"],
    title: typeof o.title === "string" ? o.title : undefined,
    x: Array.isArray(o.x) ? (o.x as (string | number)[]) : undefined,
    series
  };
  if (!spec.series && !spec.x) return null;
  return spec;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

const tooltipStyle = {
  background: "var(--app-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 30px rgba(22, 22, 63, 0.12)",
  color: "var(--color-fg)"
} as const;

export function ChartView({ data }: { data: unknown }) {
  const spec = useMemo(() => normalize(data), [data]);
  const gid = useId().replace(/[:]/g, "");

  const { rows, seriesKeys, pieData } = useMemo(() => {
    if (!spec) return { rows: [] as Record<string, unknown>[], seriesKeys: [] as string[], pieData: [] as { name: string; value: number }[] };
    const srs = spec.series ?? [{ name: undefined, data: [] }];
    const keys = srs.map((s, i) => s.name || "Série " + (i + 1));
    if (spec.type === "pie") {
      const names = spec.x ?? keys;
      const vals = srs[0]?.data ?? [];
      const pie = vals
        .map((v, i) => ({ name: String(names[i] ?? "Part " + (i + 1)), value: toNumber(v) ?? 0 }))
        .filter((d) => d.value > 0);
      return { rows: [], seriesKeys: keys, pieData: pie };
    }
    const n = Math.max(0, ...srs.map((s) => s.data.length), spec.x?.length ?? 0);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < n; i++) {
      const row: Record<string, unknown> = { x: spec.x?.[i] ?? i };
      srs.forEach((s, k) => {
        const v = s.data[i];
        row[keys[k]] = v === null || v === undefined ? null : v;
      });
      rows.push(row);
    }
    return { rows, seriesKeys: keys, pieData: [] };
  }, [spec]);

  if (!spec) return null;

  const title = spec.title || "Graphique";
  const axisTick = { fill: "currentColor", fontSize: 11 };
  const axisLine = { stroke: "currentColor", strokeOpacity: 0.25 };
  const grid = <CartesianGrid strokeDasharray="3 6" stroke="currentColor" strokeOpacity={0.15} vertical={false} />;
  const tooltip = <RcTooltip contentStyle={tooltipStyle} cursor={{ stroke: "#9e3ffd", strokeOpacity: 0.35, strokeWidth: 1 }} />;
  const legend = <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />;

  const gradients = seriesKeys.map((k, i) => {
    const color = PALETTE[i % PALETTE.length];
    return (
      <defs key={k}>
        <linearGradient id={gid + "-g" + i} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.85} />
          <stop offset="100%" stopColor={color} stopOpacity={0.06} />
        </linearGradient>
      </defs>
    );
  });

  return (
    <div className="rounded-xl border border-sub surface p-3 my-3 animate-pop-in">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 size={14} className="text-accent shrink-0" />
        <span className="text-xs font-medium fg-muted">{title}</span>
      </div>
      <div className="w-full fg-faint" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "bar" ? (
            <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barCategoryGap="28%">
              {gradients}
              {grid}
              <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={axisLine} />
              <YAxis width={38} tick={axisTick} tickLine={false} axisLine={false} />
              {tooltip}
              {legend}
              {seriesKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} radius={[6, 6, 0, 0]} animationDuration={900} animationEasing="ease-out" />
              ))}
            </BarChart>
          ) : spec.type === "area" ? (
            <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              {gradients}
              {grid}
              <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={axisLine} />
              <YAxis width={38} tick={axisTick} tickLine={false} axisLine={false} />
              {tooltip}
              {legend}
              {seriesKeys.map((k, i) => (
                <Area key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} fill={"url(#" + gid + "-g" + i + ")"} animationDuration={900} animationEasing="ease-out" />
              ))}
            </AreaChart>
          ) : spec.type === "scatter" ? (
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              {grid}
              <XAxis dataKey="x" type="number" tick={axisTick} tickLine={false} axisLine={axisLine} domain={["auto", "auto"]} />
              <YAxis type="number" width={38} tick={axisTick} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              {tooltip}
              {legend}
              {seriesKeys.map((k, i) => (
                <Scatter key={k} data={rows} dataKey={k} fill={PALETTE[i % PALETTE.length]} animationDuration={900} animationEasing="ease-out" />
              ))}
            </ScatterChart>
          ) : spec.type === "pie" ? (
            <PieChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              {tooltip}
              {legend}
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius="46%"
                outerRadius="78%"
                paddingAngle={2}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              {gradients}
              {grid}
              <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={axisLine} />
              <YAxis width={38} tick={axisTick} tickLine={false} axisLine={false} />
              {tooltip}
              {legend}
              {seriesKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} dot={{ r: 2.5, fill: PALETTE[i % PALETTE.length], strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={900} animationEasing="ease-out" />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
