const DEFAULT_PDF_THEME = {
  primary: [250, 204, 21],
  secondary: [245, 158, 11],
  accent: [253, 230, 138],
  dark: [10, 10, 12],
  surface: [24, 24, 27],
  light: [255, 255, 255],
  mutedLight: [235, 235, 235],
  mutedDark: [80, 80, 80],
  mutedMid: [180, 180, 180],
  red: [220, 38, 38],
  green: [22, 163, 74],
  blue: [37, 99, 235],
};

const hexToRgbArray = (hex, fallback) => {
  if (!hex || typeof hex !== 'string') return fallback;
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 6) return fallback;
  const parts = cleaned.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16));
  if (!parts || parts.some((value) => Number.isNaN(value))) return fallback;
  return parts;
};

const mix = (colorA, colorB, ratioB = 0.5) => colorA.map((value, index) => Math.round((value * (1 - ratioB)) + (colorB[index] * ratioB)));

export const getPdfBranding = (settings = {}, logoBase64 = null) => {
  const palette = settings?.branding?.palette || {};
  const primary = hexToRgbArray(palette.primary, DEFAULT_PDF_THEME.primary);
  const secondary = hexToRgbArray(palette.secondary, DEFAULT_PDF_THEME.secondary);
  const accent = hexToRgbArray(palette.accent, DEFAULT_PDF_THEME.accent);
  const dark = hexToRgbArray(palette.surface_alt, DEFAULT_PDF_THEME.dark);
  const surface = hexToRgbArray(palette.surface, DEFAULT_PDF_THEME.surface);
  const light = hexToRgbArray(palette.text, DEFAULT_PDF_THEME.light);
  const mutedDark = hexToRgbArray(palette.muted_text, DEFAULT_PDF_THEME.mutedDark);
  const mutedMid = mix(surface, light, 0.62);
  const mutedLight = mix(surface, light, 0.9);
  const chartPalette = [
    hexToRgbArray(palette.chart_1, primary),
    hexToRgbArray(palette.chart_2, secondary),
    hexToRgbArray(palette.chart_3, DEFAULT_PDF_THEME.green),
    hexToRgbArray(palette.chart_4, DEFAULT_PDF_THEME.blue),
    hexToRgbArray(palette.chart_5, DEFAULT_PDF_THEME.red),
  ];
  const companyName = settings?.company_info?.name || settings?.company_name || 'Obelisco Radical';
  const companySubtitle = settings?.company_info?.subtitle || '';

  return {
    ...DEFAULT_PDF_THEME,
    primary,
    secondary,
    accent,
    dark,
    surface,
    light,
    mutedDark,
    mutedMid,
    mutedLight,
    chartPalette,
    logoBase64: logoBase64 || settings?.branding?.logo_data_url || settings?.logo_base64 || settings?.logo || null,
    companyName,
    companySubtitle,
    companyLabel: companyName.toUpperCase(),
    footerLabel: `${companyName.toUpperCase()} · Documento interno · Confidencial`,
  };
};