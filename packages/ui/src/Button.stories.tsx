import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { Icon } from "./Icon";

const meta = {
  title: "Componentes/Button",
  component: Button,
  args: { children: "Crear oportunidad" },
  argTypes: { variant: { control: "inline-radio", options: ["primary", "secondary", "ghost"] } },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primario: Story = { args: { variant: "primary" } };
export const Secundario: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Deshabilitado: Story = { args: { disabled: true } };
export const Cargando: Story = { args: { loading: true } };
export const ConIcono: Story = {
  render: (args) => (
    <Button {...args}>
      <Icon name="plus" />
      Nueva oportunidad
    </Button>
  ),
};
