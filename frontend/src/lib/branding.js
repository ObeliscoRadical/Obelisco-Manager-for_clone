import api, { companySessionStore } from './api';
import { safeSessionGetJson, safeSessionSetJson } from './browserStorage';

const BRANDING_CACHE_KEY = 'obelisco_branding_cache_session';

export const DEFAULT_BRANDING_PAYLOAD = {
  company_id: null,
  company_slug: null,
  company_name: 'Obelisco Radical',
  company_info: {
    name: 'Obelisco Radical',
    subtitle: 'Eletricidade & Telecomunicações',
    phone: '+351 911 132 401',
    email: 'obeliscoradical@gmail.com',
    website: 'www.obeliscoradical.pt',
    address: 'Grande Lisboa',
    nif: '',
  },
  branding: {
    source: 'default',
    updated_at: null,
    logo_data_url: null,
    palette: {
      primary: '#facc15',
      primary_strong: '#eab308',
      secondary: '#f59e0b',
      accent: '#fde68a',
      surface: '#18181b',
      surface_alt: '#09090b',
      border: '#3f3f46',
      text: '#fafafa',
      muted_text: '#a1a1aa',
      on_primary: '#09090b',
      chart_1: '#facc15',
      chart_2: '#f59e0b',
      chart_3: '#22c55e',
      chart_4: '#3b82f6',
      chart_5: '#ef4444',
    },
  },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex, fallback = [250, 204, 21]) => {
  if (!hex || typeof hex !== 'string') return fallback;
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 6) return fallback;
  const parsed = cleaned.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16));
  if (!parsed || parsed.some((value) => Number.isNaN(value))) return fallback;
  return parsed;
};

const rgbToHslTokens = ([r, g, b]) => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case nr:
        h = (ng - nb) / d + (ng < nb ? 6 : 0);
        break;
      case ng:
        h = (nb - nr) / d + 2;
        break;
      default:
        h = (nr - ng) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const mixRgb = (colorA, colorB, ratioB = 0.5) => {
  const ratio = clamp(ratioB, 0, 1);
  return colorA.map((value, index) => Math.round((value * (1 - ratio)) + (colorB[index] * ratio)));
};

export const normalizeBrandingPayload = (input = {}) => {
  const merged = {
    ...DEFAULT_BRANDING_PAYLOAD,
    ...input,
    company_info: {
      ...DEFAULT_BRANDING_PAYLOAD.company_info,
      ...(input.company_info || {}),
    },
    branding: {
      ...DEFAULT_BRANDING_PAYLOAD.branding,
      ...(input.branding || {}),
      palette: {
        ...DEFAULT_BRANDING_PAYLOAD.branding.palette,
        ...((input.branding || {}).palette || {}),
      },
    },
  };

  merged.company_name = merged.company_name || merged.company_info?.name || DEFAULT_BRANDING_PAYLOAD.company_name;
  merged.company_info.name = merged.company_info?.name || merged.company_name;
  return merged;
};

export const buildBrandingFromSettings = (settings = {}, companyCtx = {}) => normalizeBrandingPayload({
  company_id: companyCtx?.company_id || settings?.company_id || null,
  company_slug: companyCtx?.company_slug || settings?.company_slug || null,
  company_name: settings?.company_info?.name || companyCtx?.company_name || DEFAULT_BRANDING_PAYLOAD.company_name,
  company_info: settings?.company_info || {},
  branding: settings?.branding || {},
});

export const getCachedBranding = () => normalizeBrandingPayload(safeSessionGetJson(BRANDING_CACHE_KEY, DEFAULT_BRANDING_PAYLOAD));

export const cacheBranding = (payload) => {
  safeSessionSetJson(BRANDING_CACHE_KEY, normalizeBrandingPayload(payload));
};

export const getBrandLogo = (payload) => normalizeBrandingPayload(payload).branding?.logo_data_url || null;

export const applyBrandingToDocument = (payload) => {
  if (typeof document === 'undefined') return;
  const next = normalizeBrandingPayload(payload);
  const palette = next.branding.palette;
  const primaryRgb = hexToRgb(palette.primary, [250, 204, 21]);
  const secondaryRgb = hexToRgb(palette.secondary, [245, 158, 11]);
  const accentRgb = hexToRgb(palette.accent, [253, 230, 138]);
  const surfaceRgb = hexToRgb(palette.surface, [24, 24, 27]);
  const surfaceAltRgb = hexToRgb(palette.surface_alt, [9, 9, 11]);
  const borderRgb = hexToRgb(palette.border, [63, 63, 70]);
  const textRgb = hexToRgb(palette.text, [250, 250, 250]);
  const mutedRgb = hexToRgb(palette.muted_text, [161, 161, 170]);
  const mutedSurfaceRgb = mixRgb(surfaceRgb, [255, 255, 255], 0.06);
  const inputRgb = mixRgb(surfaceRgb, [255, 255, 255], 0.03);
  const root = document.documentElement;

  root.style.setProperty('--brand-primary', palette.primary);
  root.style.setProperty('--brand-primary-strong', palette.primary_strong || palette.primary);
  root.style.setProperty('--brand-primary-rgb', primaryRgb.join(', '));
  root.style.setProperty('--brand-secondary', palette.secondary);
  root.style.setProperty('--brand-secondary-rgb', secondaryRgb.join(', '));
  root.style.setProperty('--brand-accent', palette.accent);
  root.style.setProperty('--brand-accent-rgb', accentRgb.join(', '));
  root.style.setProperty('--brand-surface', palette.surface);
  root.style.setProperty('--brand-surface-alt', palette.surface_alt);
  root.style.setProperty('--brand-border', palette.border);
  root.style.setProperty('--brand-border-rgb', borderRgb.join(', '));
  root.style.setProperty('--brand-text', palette.text);
  root.style.setProperty('--brand-muted', palette.muted_text);
  root.style.setProperty('--brand-on-primary', palette.on_primary || '#09090b');

  root.style.setProperty('--background', rgbToHslTokens(surfaceAltRgb));
  root.style.setProperty('--foreground', rgbToHslTokens(textRgb));
  root.style.setProperty('--card', rgbToHslTokens(surfaceRgb));
  root.style.setProperty('--card-foreground', rgbToHslTokens(textRgb));
  root.style.setProperty('--popover', rgbToHslTokens(surfaceRgb));
  root.style.setProperty('--popover-foreground', rgbToHslTokens(textRgb));
  root.style.setProperty('--primary', rgbToHslTokens(primaryRgb));
  root.style.setProperty('--primary-foreground', rgbToHslTokens(hexToRgb(palette.on_primary || '#09090b', [9, 9, 11])));
  root.style.setProperty('--secondary', rgbToHslTokens(surfaceRgb));
  root.style.setProperty('--secondary-foreground', rgbToHslTokens(textRgb));
  root.style.setProperty('--muted', rgbToHslTokens(mutedSurfaceRgb));
  root.style.setProperty('--muted-foreground', rgbToHslTokens(mutedRgb));
  root.style.setProperty('--accent', rgbToHslTokens(accentRgb));
  root.style.setProperty('--accent-foreground', rgbToHslTokens(textRgb));
  root.style.setProperty('--border', rgbToHslTokens(borderRgb));
  root.style.setProperty('--input', rgbToHslTokens(inputRgb));
  root.style.setProperty('--ring', rgbToHslTokens(primaryRgb));
  root.style.setProperty('--chart-1', rgbToHslTokens(hexToRgb(palette.chart_1, primaryRgb)));
  root.style.setProperty('--chart-2', rgbToHslTokens(hexToRgb(palette.chart_2, secondaryRgb)));
  root.style.setProperty('--chart-3', rgbToHslTokens(hexToRgb(palette.chart_3, [34, 197, 94])));
  root.style.setProperty('--chart-4', rgbToHslTokens(hexToRgb(palette.chart_4, [59, 130, 246])));
  root.style.setProperty('--chart-5', rgbToHslTokens(hexToRgb(palette.chart_5, [239, 68, 68])));
  root.setAttribute('data-brand-company', next.company_name || DEFAULT_BRANDING_PAYLOAD.company_name);
};

export const fetchPublicBranding = async ({ companyId = null, companySlug = null } = {}) => {
  const cached = getCachedBranding();
  const params = {};
  if (companyId || companySessionStore.get()) params.company_id = companyId || companySessionStore.get();
  if (companySlug || cached?.company_slug) params.company_slug = companySlug || cached?.company_slug;
  const { data } = await api.get('/public/branding', { params });
  return normalizeBrandingPayload(data);
};