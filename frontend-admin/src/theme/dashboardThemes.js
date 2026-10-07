const families = [
  ['Orchid', '#7c3aed', '#a855f7', '#f4f0ff', '#ffffff', '#111827'],
  ['Indigo', '#4f46e5', '#6366f1', '#eef2ff', '#ffffff', '#111827'],
  ['Ocean', '#0369a1', '#0ea5e9', '#eef8ff', '#ffffff', '#0f172a'],
  ['Aqua', '#0f766e', '#14b8a6', '#ecfdf8', '#ffffff', '#0f172a'],
  ['Emerald', '#047857', '#10b981', '#eefcf5', '#ffffff', '#10231b'],
  ['Forest', '#166534', '#22c55e', '#f0fdf4', '#ffffff', '#132219'],
  ['Lime', '#4d7c0f', '#84cc16', '#f7fee7', '#ffffff', '#1a2e05'],
  ['Amber', '#b45309', '#f59e0b', '#fffbeb', '#ffffff', '#292015'],
  ['Coral', '#c2410c', '#fb7185', '#fff4f2', '#ffffff', '#2d1717'],
  ['Rose', '#be123c', '#f43f5e', '#fff1f2', '#ffffff', '#2b1219'],
  ['Slate', '#334155', '#64748b', '#f1f5f9', '#ffffff', '#0f172a'],
];

const modes = [
  ['Night', 9, '#0f172a'],
  ['Mist', 1, '#f8fafc'],
  ['Glass', 2, 'rgba(255,255,255,.82)'],
  ['Pearl', 3, '#fffdfb'],
  ['Cloud', 4, '#f7f8fc'],
  ['Soft', 5, '#fbfbfe'],
  ['Studio', 6, '#ffffff'],
  ['Bloom', 7, '#fffaff'],
  ['Calm', 8, '#f8fbff'],
];

export const dashboardThemes = families.flatMap((family, familyIndex) =>
  modes.map((mode, modeIndex) => {
    const [familyName, primary, accent, background, surface, text] = family;
    const [modeName, softness, card] = mode;
    const id = `nst-${String(familyIndex * modes.length + modeIndex + 1).padStart(2, '0')}`;
    return {
      id,
      name: `${familyName} ${modeName}`,
      builtIn: true,
      primary,
      accent,
      background: modeName === 'Night' ? '#07111f' : background,
      surface: modeName === 'Night' ? '#0d192a' : (card || surface),
      text: modeName === 'Night' ? '#f8fafc' : text,
      muted: modeName === 'Night' ? '#94a3b8' : '#64748b',
      border: modeName === 'Night' ? 'rgba(148,163,184,.16)' : (softness >= 2 ? 'rgba(148,163,184,.22)' : '#e7eaf0'),
      sidebar: modeName === 'Night' ? '#081321' : surface,
      topbar: modeName === 'Night' ? '#081321' : surface,
      radius: `${24 + (softness % 3) * 4}px`,
      shadow: softness >= 2 ? '0 18px 55px rgba(15,23,42,.09)' : '0 10px 32px rgba(15,23,42,.07)',
      blur: softness >= 2 ? '18px' : '0px',
    };
  }),
);

export const defaultDashboardTheme = dashboardThemes.find((theme) => theme.name === 'Emerald Mist') || dashboardThemes[0];
export const customDashboardThemeId = 'nst-custom';
export const dashboardThemeCacheKey = 'nst-dashboard-effective-theme:v2';

function expandHex(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split('').map((character) => character + character).join('')
    : match[1];
  return `#${hex.toLowerCase()}`;
}

function rgbFromColor(value) {
  const hex = expandHex(value);
  if (hex) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  const match = String(value || '').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function rgbToHex({ r, g, b }) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixColors(first, second, firstWeight = 0.5) {
  const a = rgbFromColor(first);
  const b = rgbFromColor(second);
  if (!a || !b) return first || second;
  const weight = Math.max(0, Math.min(1, Number(firstWeight)));
  return rgbToHex({
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  });
}

function relativeLuminance(value) {
  const rgb = rgbFromColor(value);
  if (!rgb) return 0.5;
  const convert = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

function rgbaColor(value, alpha) {
  const rgb = rgbFromColor(value);
  if (!rgb) return `rgba(148,163,184,${alpha})`;
  return `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${alpha})`;
}

function bestForeground(value) {
  return relativeLuminance(value) > 0.47 ? '#07111f' : '#ffffff';
}

function deriveCustomTheme(theme) {
  const background = expandHex(theme.background) || theme.background || '#f8fafc';
  const surface = expandHex(theme.surface) || theme.surface || '#ffffff';
  const text = expandHex(theme.text) || theme.text || bestForeground(surface);
  const primary = expandHex(theme.primary) || theme.primary || '#4f46e5';
  const accent = expandHex(theme.accent) || theme.accent || primary;
  const dark = relativeLuminance(background) < 0.34;

  return {
    ...theme,
    id: customDashboardThemeId,
    name: 'Custom Theme',
    builtIn: false,
    primary,
    accent,
    background,
    surface,
    text,
    muted: mixColors(text, surface, dark ? 0.63 : 0.58),
    border: rgbaColor(text, dark ? 0.20 : 0.16),
    sidebar: surface,
    topbar: surface,
    radius: theme.radius || '24px',
    shadow: dark ? '0 18px 55px rgba(0,0,0,.30)' : '0 18px 55px rgba(15,23,42,.10)',
    blur: theme.blur || '0px',
    customTokenVersion: 3,
  };
}

export function normalizeDashboardTheme(theme) {
  const merged = { ...defaultDashboardTheme, ...(theme || {}) };
  return merged.id === customDashboardThemeId || merged.builtIn === false
    ? deriveCustomTheme(merged)
    : merged;
}

export function updateCustomDashboardTheme(theme, key, value) {
  return normalizeDashboardTheme({
    ...theme,
    id: customDashboardThemeId,
    name: 'Custom Theme',
    builtIn: false,
    [key]: value,
  });
}

export function readCachedDashboardTheme() {
  try {
    const current = JSON.parse(localStorage.getItem(dashboardThemeCacheKey) || 'null');
    const legacy = current || JSON.parse(localStorage.getItem('nst-dashboard-effective-theme:v1') || 'null');
    if (!legacy || typeof legacy !== 'object' || !legacy.theme) return null;
    return { theme: normalizeDashboardTheme(legacy.theme), savedAt: Number(legacy.savedAt || 0) };
  } catch {
    return null;
  }
}

export function cacheDashboardTheme(theme) {
  const resolved = normalizeDashboardTheme(theme);
  try {
    localStorage.setItem(dashboardThemeCacheKey, JSON.stringify({ theme: resolved, savedAt: Date.now() }));
    localStorage.removeItem('nst-dashboard-effective-theme:v1');
  } catch {}
  return resolved;
}

export function applyDashboardTheme(theme) {
  const resolved = normalizeDashboardTheme(theme);
  const root = document.documentElement;
  const dark = relativeLuminance(resolved.background) < 0.34;
  const onPrimary = bestForeground(resolved.primary);
  const onAccent = bestForeground(resolved.accent);
  const secondary = mixColors(resolved.text, resolved.surface, dark ? 0.28 : 0.18);
  const onSecondary = bestForeground(secondary);

  const values = {
    '--nst-dashboard-primary': resolved.primary,
    '--nst-dashboard-accent': resolved.accent,
    '--nst-dashboard-bg': resolved.background,
    '--nst-dashboard-page': resolved.background,
    '--nst-dashboard-surface': resolved.surface,
    '--nst-dashboard-card': resolved.surface,
    '--nst-dashboard-card-elevated': `color-mix(in srgb, ${resolved.surface} 94%, ${resolved.text} 6%)`,
    '--nst-dashboard-input': `color-mix(in srgb, ${resolved.surface} 94%, ${resolved.background} 6%)`,
    '--nst-dashboard-secondary': secondary,
    '--nst-dashboard-text': resolved.text,
    '--nst-dashboard-muted': resolved.muted,
    '--nst-dashboard-border': resolved.border,
    '--nst-dashboard-sidebar': resolved.sidebar,
    '--nst-dashboard-topbar': resolved.topbar,
    '--nst-dashboard-on-primary': onPrimary,
    '--nst-dashboard-on-accent': onAccent,
    '--nst-dashboard-on-secondary': onSecondary,
    '--nst-dashboard-primary-soft': `color-mix(in srgb, ${resolved.primary} 14%, ${resolved.surface})`,
    '--nst-dashboard-accent-soft': `color-mix(in srgb, ${resolved.accent} 14%, ${resolved.surface})`,
    '--nst-dashboard-hover': `color-mix(in srgb, ${resolved.primary} 12%, ${resolved.surface})`,
    '--nst-dashboard-selected': `color-mix(in srgb, ${resolved.primary} 24%, ${resolved.surface})`,
    '--nst-dashboard-selected-border': `color-mix(in srgb, ${resolved.primary} 72%, ${resolved.border})`,
    '--nst-dashboard-active': `linear-gradient(135deg, ${resolved.primary}, ${resolved.accent})`,
    '--nst-dashboard-focus-ring': `color-mix(in srgb, ${resolved.primary} 28%, transparent)`,
    '--nst-dashboard-success': '#16a34a',
    '--nst-dashboard-success-soft': `color-mix(in srgb, #16a34a 14%, ${resolved.surface})`,
    '--nst-dashboard-warning': '#d97706',
    '--nst-dashboard-warning-soft': `color-mix(in srgb, #d97706 14%, ${resolved.surface})`,
    '--nst-dashboard-danger': '#e11d48',
    '--nst-dashboard-danger-soft': `color-mix(in srgb, #e11d48 14%, ${resolved.surface})`,
    '--nst-dashboard-info': '#0284c7',
    '--nst-dashboard-info-soft': `color-mix(in srgb, #0284c7 14%, ${resolved.surface})`,
    '--nst-dashboard-radius': resolved.radius,
    '--nst-dashboard-shadow': resolved.shadow,
    '--nst-dashboard-blur': resolved.blur,
    '--nst-dashboard-color-scheme': dark ? 'dark' : 'light',

    // Legacy aliases used by older NST modules.
    '--primary-color': resolved.primary,
    '--dashboard-primary': resolved.primary,
    '--dashboard-secondary': secondary,
    '--dashboard-accent': resolved.accent,
    '--dashboard-bg': resolved.background,
    '--dashboard-sidebar': resolved.sidebar,
    '--dashboard-topbar': resolved.topbar,
    '--dashboard-card': resolved.surface,
    '--dashboard-text': resolved.text,
  };

  Object.entries(values).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.dashboardTheme = resolved.id || customDashboardThemeId;
  root.dataset.dashboardColorScheme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.body.classList.toggle('nst-admin-theme-dark', dark);
  document.body.classList.toggle('nst-admin-theme-light', !dark);
  document.body.style.backgroundColor = resolved.background;
  document.body.style.color = resolved.text;
  window.dispatchEvent(new CustomEvent('nst-dashboard-theme-applied', { detail: resolved }));
  return resolved;
}
