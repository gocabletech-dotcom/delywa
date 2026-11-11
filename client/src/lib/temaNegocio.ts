export const COLOR_PRIMARIO_FALLBACK = "#25D366";

export function normalizeBusinessColor(color?: string | null): string {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color! : COLOR_PRIMARIO_FALLBACK;
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function businessTheme(color?: string | null): React.CSSProperties {
  const normalized = normalizeBusinessColor(color);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const foreground = (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#111827" : "#ffffff";
  return {
    "--primary": hexToHsl(normalized),
    "--accent": hexToHsl(normalized),
    "--ring": hexToHsl(normalized),
    "--primary-foreground": foreground === "#ffffff" ? "0 0% 100%" : "0 0% 7%",
  } as React.CSSProperties;
}