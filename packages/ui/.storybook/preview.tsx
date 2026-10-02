import type { Decorator, Preview } from "@storybook/react-vite";
import "./preview.css";

/** Selector de tema Light/Dark en la barra de Storybook: aplica `data-theme` como la app real. */
const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme === "dark" ? "dark" : "light";
  return (
    <div className="bg-canvas text-primary min-h-24 p-6">
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Tema",
      toolbar: {
        title: "Tema",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Claro" },
          { value: "dark", title: "Oscuro" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
  },
};

export default preview;
