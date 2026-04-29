import type { TeamSettings } from "../../types/team";

export type EstimateScale = NonNullable<TeamSettings["estimates"]>["scale"];

export const ESTIMATE_SCALES: Record<EstimateScale, { values: number[]; labels: Record<number, string>; unit: string }> = {
  fibonacci: {
    values: [0, 1, 2, 3, 5, 8, 13, 21],
    labels: { 0: "0", 1: "1", 2: "2", 3: "3", 5: "5", 8: "8", 13: "13", 21: "21" },
    unit: "pts",
  },
  linear: {
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    labels: { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10" },
    unit: "pts",
  },
  tshirt: {
    values: [1, 2, 3, 5, 8, 13],
    labels: { 1: "XS", 2: "S", 3: "M", 5: "L", 8: "XL", 13: "XXL" },
    unit: "",
  },
  not_in_use: {
    values: [],
    labels: {},
    unit: "",
  },
};

export function getEstimateScale(settings?: TeamSettings): EstimateScale {
  return settings?.estimates?.scale ?? "fibonacci";
}

export function formatEstimate(value: number | null, scale: EstimateScale): string {
  if (value == null) return "No estimate";
  const cfg = ESTIMATE_SCALES[scale];
  const label = cfg.labels[value];
  if (label !== undefined) {
    return cfg.unit ? `${label} ${cfg.unit}` : label;
  }
  return cfg.unit ? `${value} ${cfg.unit}` : String(value);
}

export function formatEstimateShort(value: number | null, scale: EstimateScale): string {
  if (value == null) return "";
  const cfg = ESTIMATE_SCALES[scale];
  return cfg.labels[value] ?? String(value);
}

export function estimateUnit(scale: EstimateScale): string {
  return ESTIMATE_SCALES[scale].unit || "";
}
