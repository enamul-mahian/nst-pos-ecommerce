import { registerCoreBlocks } from './renderer/coreBlocks';

let initialized = false;
export const initializeBuilderRuntime = (): void => {
  if (initialized) return;
  registerCoreBlocks();
  initialized = true;
};

export * from './schema/website.schema';
export { default as DynamicPageRenderer } from './renderer/DynamicPageRenderer';
export { default as DynamicSiteShell } from './renderer/DynamicSiteShell';
