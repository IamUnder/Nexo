import { cn, Icon, Input } from "@nexo/ui";
import { forwardRef, type InputHTMLAttributes, useState } from "react";
import { useTranslation } from "react-i18next";

/** Campo de contraseña con botón para mostrar/ocultar (accesible por teclado y con etiqueta). */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, ...props }, ref) {
    const { t } = useTranslation("auth");
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("login.hidePassword") : t("login.showPassword")}
          aria-pressed={visible}
          className="text-secondary absolute top-0 right-0 inline-flex size-10 items-center justify-center rounded-control outline-none hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon name={visible ? "eye-off" : "eye"} size={18} />
        </button>
      </div>
    );
  },
);
