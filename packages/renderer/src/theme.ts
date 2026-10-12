import type { ThemeTokens } from '@pb/schema';
import { readableOn } from './color.ts';
import { fontStack } from './fonts.ts';

type Colors = ThemeTokens['colors']['light'];

const DENSITY = { compact: 0.8, comfortable: 1, roomy: 1.25 } as const;
const SHADOW = {
  none: 'none',
  soft: '0 1px 2px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 0 0 / 0.06)',
  strong: '0 2px 4px rgb(0 0 0 / 0.1), 0 12px 32px rgb(0 0 0 / 0.14)',
} as const;

function colorVars(c: Colors): string {
  return [
    `--pb-bg:${c.background}`,
    `--pb-surface:${c.surface}`,
    `--pb-text:${c.text}`,
    `--pb-muted:${c.muted}`,
    `--pb-primary:${c.primary}`,
    `--pb-on-primary:${readableOn(c.primary)}`,
    `--pb-accent:${c.accent}`,
    `--pb-border:${c.border}`,
    `color-scheme:${readableOn(c.background) === '#ffffff' ? 'dark' : 'light'}`,
  ].join(';');
}

/**
 * Fluid type scale: step n is scale^n rem on desktop and grows smoothly from a
 * smaller size on phones (400px) to the full size at 1200px.
 */
function typeScale(scale: number): string {
  const steps: string[] = [];
  for (let n = -1; n <= 5; n++) {
    const max = Math.pow(scale, n);
    const min = n <= 0 ? max : 1 + (max - 1) * 0.6;
    const name = n < 0 ? 'm1' : String(n);
    const value =
      min === max
        ? `${max.toFixed(3)}rem`
        : `clamp(${min.toFixed(3)}rem, calc(${min.toFixed(3)}rem + ${(max - min).toFixed(3)} * ((100vw - 25rem) / 50)), ${max.toFixed(3)}rem)`;
    steps.push(`--pb-step-${name}:${value}`);
  }
  return steps.join(';');
}

/**
 * theme.css: every design decision as a CSS custom property. Light values on :root,
 * dark values under [data-theme="dark"], and — for "auto" — the system preference
 * unless the visitor picked light explicitly.
 */
export function themeCss(t: ThemeTokens): string {
  const base = [
    `--pb-font-heading:${fontStack(t.fonts.heading)}`,
    `--pb-font-body:${fontStack(t.fonts.body)}`,
    `--pb-font-mono:${fontStack(t.fonts.mono, 'mono')}`,
    typeScale(t.scale),
    `--pb-radius:${t.radius}px`,
    `--pb-space:${DENSITY[t.density]}`,
    `--pb-shadow:${SHADOW[t.shadow]}`,
    `--pb-width:${t.width}px`,
    `--pb-motion:${t.motion === 'none' ? 0 : 1}`,
  ].join(';');

  const lightFirst = t.colorMode !== 'dark';
  const primary = lightFirst ? t.colors.light : t.colors.dark;
  const secondary = lightFirst ? t.colors.dark : t.colors.light;
  const secondaryAttr = lightFirst ? 'dark' : 'light';

  let css = `:root{${base};${colorVars(primary)}}\n`;
  css += `:root[data-theme="${secondaryAttr}"]{${colorVars(secondary)}}\n`;
  if (t.colorMode === 'auto') {
    css += `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${colorVars(t.colors.dark)}}}\n`;
  }
  return css;
}

export const fontsUsed = (t: ThemeTokens) => [
  ...new Set([t.fonts.heading, t.fonts.body, t.fonts.mono]),
];
