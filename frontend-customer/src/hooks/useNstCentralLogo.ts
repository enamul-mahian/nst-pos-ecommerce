import { useEffect, useState } from 'react';

const CACHE_KEY = 'nst_central_brand_logo';

function cachedLogo(): string {
  try {
    return localStorage.getItem(CACHE_KEY) || '';
  } catch {
    return '';
  }
}

export default function useNstCentralLogo() {
  const [logo, setLogo] = useState<string>(cachedLogo);

  useEffect(() => {
    let alive = true;

    const host = window.location.hostname;

    const url =
      host === 'localhost' || host === '127.0.0.1'
        ? 'https://newsingapurtele.com/api/public/system-ui-settings'
        : '/api/public/system-ui-settings';

    fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!alive) return;

        const settings = payload?.data || payload || {};

        let brand = settings?.ui_brand || {};

        if (typeof brand === 'string') {
          try {
            brand = JSON.parse(brand);
          } catch {
            brand = {};
          }
        }

        const nextLogo =
          typeof brand?.logoUrl === 'string'
            ? brand.logoUrl.trim()
            : '';

        if (nextLogo) {
          setLogo(nextLogo);

          try {
            localStorage.setItem(
              CACHE_KEY,
              nextLogo
            );
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  return logo;
}
