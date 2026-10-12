import type { CustomCode, PortfolioContent, SiteSpec } from '@pb/schema';

export type ContactFormConfig = {
  service: 'none' | 'formspree' | 'web3forms' | 'endpoint' | 'link';
  value: string;
};

/** Everything that defines a site. Files are always derived from this. */
export interface SiteState {
  content: PortfolioContent;
  spec: SiteSpec;
  custom: CustomCode;
  contactForm: ContactFormConfig;
}

export interface AssetInfo {
  /** URL used in the page: a blob: URL in preview, a relative path in export. */
  src: string;
  width?: number;
  height?: number;
  /** Optional responsive sources, e.g. "a-480.webp 480w, a-960.webp 960w". */
  srcset?: string;
}

export interface RenderOptions {
  /** preview: shown in the editor; export: files for the ZIP. */
  mode: 'preview' | 'export';
  /** Adds data-pb-path attributes so text can be edited inline in the preview. */
  editable?: boolean;
  /** Image lookup by assetId. Missing images render as tasteful placeholders. */
  assets?: Record<string, AssetInfo>;
  /** Where web fonts come from. Export bundles font files; preview may use Google Fonts. */
  fontSource?: 'self-hosted' | 'google' | 'system';
  /** Fixed clock for deterministic output (footer year). */
  now?: Date;
}

export type SiteFiles = Record<string, string>;

export type Severity = 'error' | 'warning' | 'info';

export interface CheckResult {
  id: string;
  severity: Severity;
  message: string;
  sectionId?: string;
  path?: string;
}

export interface RenderResult {
  files: SiteFiles;
  checks: CheckResult[];
  /** Font families the site uses (export bundles their files). */
  fonts: string[];
}
