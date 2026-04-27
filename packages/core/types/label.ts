export type LabelColor =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "gray";

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: LabelColor;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateLabelRequest {
  name: string;
  color: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
  position?: number;
}

export interface ListLabelsResponse {
  labels: Label[];
}
