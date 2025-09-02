import React from "react";
import "./styles/Loader.css";

type LoaderProps = {
  /** Estilo visual del loader */
  variant?: "ring" | "dots" | "bar";
  /** sm | md | lg o un número en px */
  size?: "sm" | "md" | "lg" | number;
  /** Texto accesible (o visible si fullscreen) */
  label?: string;
  /** Cubre la pantalla con overlay semitransparente */
  fullscreen?: boolean;
  /** Progreso [0..1] para la variante 'bar'. Si no se pasa, es indeterminado */
  progress?: number;
  /** Clases extra */
  className?: string;
};

const pxFromSize = (s: LoaderProps["size"]) => {
  if (typeof s === "number") return s;
  switch (s) {
    case "sm": return 24;
    case "lg": return 64;
    case "md":
    default: return 40;
  }
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default function Loader({
  variant = "ring",
  size = "md",
  label = "Cargando…",
  fullscreen = false,
  progress,
  className = "",
}: LoaderProps) {
  const px = pxFromSize(size);
  const style: React.CSSProperties = {
    // Variables CSS para tematizar
    // @ts-ignore: custom properties
    "--loader-size": `${px}px`,
    // @ts-ignore
    "--loader-progress": progress != null ? `${clamp01(progress) * 100}%` : undefined,
  };

  const isBar = variant === "bar";
  const content =
    variant === "dots" ? (
      <div className="fe-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    ) : variant === "bar" ? (
      <div className={`fe-bar ${progress == null ? "is-indeterminate" : ""}`} aria-hidden="true">
        <div className="fe-bar-track" />
        <div className="fe-bar-fill" />
      </div>
    ) : (
      <div className="fe-ring" aria-hidden="true" />
    );

  const rootClass = [
    "fe-loader",
    `v-${variant}`,
    fullscreen ? "fe-fullscreen" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="loaderContainer">

    <div
      className={rootClass}
      style={style}
      role={isBar ? "progressbar" : "status"}
      aria-label={label}
      aria-live="polite"
      aria-busy="true"
      aria-valuemin={isBar ? 0 : undefined}
      aria-valuemax={isBar ? 100 : undefined}
      aria-valuenow={isBar && progress != null ? Math.round(clamp01(progress) * 100) : undefined}
    >
      {content}
      {fullscreen && (
        <div className="fe-label">{label}</div>
      )}
    </div>
    </div>
  );
}
