import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';

// Import global tailwind configurations and styles
// Self-hosted Bangla font (also covers the ৳ taka sign) so it renders the same on Windows, iPhone and Android, even offline.
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
import './index.css';
import { initializeBuilderRuntime } from './builder';

initializeBuilderRuntime();

// Locate the primary DOM mount element defined in index.html
const container = document.getElementById('root');

if (!container) {
  throw new Error(
    'Root element was not found in the DOM. Please check your index.html structure.'
  );
}

// Instantiate createRoot for React 18.3.1 rendering engine
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);