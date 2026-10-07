import React from 'react';
import { Helmet } from 'react-helmet-async';
import NstHome from '../../components/storefront/NstHome';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

export default function HomePage() {
  const { cms } = useWebsiteStore();
  return <>
    <Helmet>
      <title>{cms?.seo?.title || 'New Singapur Telecom | Smart Devices & Trusted Deals'}</title>
      <meta name="description" content={cms?.seo?.description || 'Shop new and verified used devices with warranty, EMI and trusted support.'}/>
    </Helmet>
    <NstHome/>
  </>;
}
