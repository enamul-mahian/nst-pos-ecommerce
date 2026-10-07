import React from 'react';
import type { BuilderBlock } from '../schema/website.schema';

export interface BlockComponentProps {
  block: BuilderBlock;
  renderChildren: (blocks?: BuilderBlock[]) => React.ReactNode;
}

export type BlockComponent = React.ComponentType<BlockComponentProps>;

const registry = new Map<string, BlockComponent>();

export const registerBlock = (type: string, component: BlockComponent): void => {
  registry.set(type.trim().toLowerCase(), component);
};

export const resolveBlock = (type: string): BlockComponent | undefined =>
  registry.get(type.trim().toLowerCase());

export const hasBlock = (type: string): boolean => registry.has(type.trim().toLowerCase());

export const getRegisteredBlockTypes = (): string[] => Array.from(registry.keys());
