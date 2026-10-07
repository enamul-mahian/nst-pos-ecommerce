import React from 'react';
import type { BuilderBlock } from '../schema/website.schema';
import { resolveBlock } from '../registry/blockRegistry';

interface Props { blocks?: BuilderBlock[]; }

export default function DynamicBlockRenderer({ blocks = [] }: Props) {
  const renderChildren = (children?: BuilderBlock[]): React.ReactNode => <DynamicBlockRenderer blocks={children} />;
  return <>{blocks
    .filter((block) => block.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((block) => {
      const Component = resolveBlock(block.type);
      return Component ? <Component key={block.id} block={block} renderChildren={renderChildren} /> : null;
    })}</>;
}
