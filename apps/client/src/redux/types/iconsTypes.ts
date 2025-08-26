export interface IconsState {
  iconName: string;
  iconColor: string;
  onClick?: () => void;
  size: "xs" | "sm" | "md" | "lg";
}
