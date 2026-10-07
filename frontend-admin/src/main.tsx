import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';

import './index.css';
import './styles/nst-modern-ui.css';
import './nst-ios-compact-ui.css';
import './nst-phase1-global.css';
import './nst-foundation.css';
import './styles/nst-design-system.css';
import './nst-transition.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element was not found in the DOM.');
}

const root = createRoot(container);

const path = window.location.pathname.replace(/\/+$/, '');

async function bootstrap() {
  if (path === '/pos/login') {
    const { default: LoginApp } = await import('./LoginApp.jsx');

    root.render(
      <React.StrictMode>
        <LoginApp />
      </React.StrictMode>
    );

    return;
  }

  const { default: App } = await import('./App.jsx');

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
