import React, { useMemo } from 'react';
import type { BuilderSite, JsonRecord } from '../schema/website.schema';
import DynamicBlockRenderer from './DynamicBlockRenderer';

interface Props {
  website: BuilderSite;
  children: React.ReactNode;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cssVariables = (theme: JsonRecord | undefined): React.CSSProperties => {
  if (!theme) return {};
  const tokens = isRecord(theme.tokens) ? theme.tokens : theme;
  const variables: Record<string, string | number> = {};
  Object.entries(tokens).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      variables[`--cms-${normalized}`] = value;
    }
  });
  return variables as React.CSSProperties;
};

export default function DynamicSiteShell({ website, children }: Props) {
  const style = useMemo(() => cssVariables(website.theme), [website.theme]);
  return (
    <div data-site-version={website.version} data-schema-version={website.schemaVersion} style={style}>
      <DynamicBlockRenderer blocks={website.globals?.header} />
      <main>{children}</main>
      <DynamicBlockRenderer blocks={website.globals?.footer} />
      <DynamicBlockRenderer blocks={website.globals?.overlays} />
    </div>
  );
}
