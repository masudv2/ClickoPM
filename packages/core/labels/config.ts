import type { LabelColor } from "../types";

export const LABEL_COLOR_CONFIG: Record<
  LabelColor,
  { label: string; dot: string; bg: string; text: string }
> = {
  red:    { label: "Red",    dot: "bg-red-500",    bg: "bg-red-500/15",    text: "text-red-700 dark:text-red-400" },
  orange: { label: "Orange", dot: "bg-orange-500", bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  amber:  { label: "Amber",  dot: "bg-amber-500",  bg: "bg-amber-500/15",  text: "text-amber-700 dark:text-amber-400" },
  yellow: { label: "Yellow", dot: "bg-yellow-500", bg: "bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400" },
  lime:   { label: "Lime",   dot: "bg-lime-500",   bg: "bg-lime-500/15",   text: "text-lime-700 dark:text-lime-400" },
  green:  { label: "Green",  dot: "bg-green-500",  bg: "bg-green-500/15",  text: "text-green-700 dark:text-green-400" },
  teal:   { label: "Teal",   dot: "bg-teal-500",   bg: "bg-teal-500/15",   text: "text-teal-700 dark:text-teal-400" },
  blue:   { label: "Blue",   dot: "bg-blue-500",   bg: "bg-blue-500/15",   text: "text-blue-700 dark:text-blue-400" },
  indigo: { label: "Indigo", dot: "bg-indigo-500", bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-400" },
  purple: { label: "Purple", dot: "bg-purple-500", bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-400" },
  pink:   { label: "Pink",   dot: "bg-pink-500",   bg: "bg-pink-500/15",   text: "text-pink-700 dark:text-pink-400" },
  gray:   { label: "Gray",   dot: "bg-gray-500",   bg: "bg-gray-500/15",   text: "text-gray-700 dark:text-gray-400" },
};

export const LABEL_COLORS: LabelColor[] = [
  "red", "orange", "amber", "yellow", "lime", "green",
  "teal", "blue", "indigo", "purple", "pink", "gray",
];
