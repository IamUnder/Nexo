import tokens from "../tokens.json" with { type: "json" };

export { contrastRatio, luminance } from "./contrast";
export type ThemeName = "light" | "dark";
export { tokens };
export const semanticTokens = tokens.semantic;
