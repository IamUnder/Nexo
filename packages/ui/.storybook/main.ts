import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Catálogo del design system (DESIGN_SYSTEM §10): documenta cada componente con todos sus estados,
 * en Light y Dark, y ejecuta axe sobre cada historia (addon-a11y).
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  framework: { name: "@storybook/react-vite", options: {} },
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
