import { cloneElement } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { usePlotArea, useXAxisScale } from "recharts";
import type { Coordinate } from "recharts";

export type BucketSelection = { index: number; coordinate: Coordinate };
type SelectedProps = {
  active: boolean;
  coordinate: Coordinate;
  label: string;
  payload: Array<{
    name: string;
    value: number;
    color: string;
    payload: unknown;
  }>;
};

/** Full-height bucket regions use the actual axis scale, including axis padding.
 * They do not intercept SVG events, so desktop drilldown and accessibility remain
 * Recharts' responsibility. DOM rectangles account for scrolling and CSS scaling.
 */
export default function ChartBucketSelection<T>({
  data,
  axisKey,
  series,
  selection,
  content,
}: {
  data: T[];
  axisKey: keyof T;
  series: Array<{ key: keyof T; name: string; color: string }>;
  selection: BucketSelection | null;
  content: ReactElement;
}) {
  const plot = usePlotArea();
  const scale = useXAxisScale();
  if (!plot || !scale) return null;
  const centers = data.map((row) =>
    scale(row[axisKey], { position: "middle" }),
  );
  const row = selection ? data[selection.index] : undefined;
  return (
    <>
      <g aria-hidden="true" pointerEvents="none">
        {centers.map((center, index) => {
          if (center === undefined) return null;
          const left =
            index === 0
              ? plot.x
              : ((centers[index - 1] ?? center) + center) / 2;
          const right =
            index === centers.length - 1
              ? plot.x + plot.width
              : (center + (centers[index + 1] ?? center)) / 2;
          return (
            <rect
              key={index}
              data-chart-bucket={index}
              x={left}
              y={plot.y}
              width={right - left}
              height={plot.height}
              fill="none"
            />
          );
        })}
      </g>
      {selection &&
        row &&
        createPortal(
          <div
            className="recharts-tooltip-wrapper"
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              pointerEvents: "none",
            }}
          >
            {cloneElement(content as ReactElement<SelectedProps>, {
              active: true,
              coordinate: selection.coordinate,
              label: String(row[axisKey]),
              payload: series.map(({ key, name, color }) => ({
                name,
                color,
                value: Number(row[key]),
                payload: row,
              })),
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
