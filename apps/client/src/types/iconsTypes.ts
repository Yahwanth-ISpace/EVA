export interface IconsState {
  iconName: string;
  iconColor: string;
  onClick?: () => void;
  size: "xs" | "sm" | "md" | "lg"; // Size can only be one of these values
}
