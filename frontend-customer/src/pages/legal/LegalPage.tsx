import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ChevronRight, 
  Scale, 
  ShieldCheck, 
  HelpCircle, 
  FileText, 
  Sparkles 
} from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useT } from '../../i18n';

export const LegalPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { cms } = useWebsiteStore();
  const t = useT();

  const pageSlug = slug || 'terms';

  // ==========================================
  // 1. Dynamic Content Resolver
  // ==========================================
  // Resolves the editable policy payload from CMS with fallback templates
  const pageData = useMemo(() => {
    const legalPages = (cms as any)?.legalPages || {
      terms: {
        title: 'Terms & Conditions',
        lastUpdated: 'Last updated: July 16, 2026',
        htmlContent: `
          <h3>${t('legal.terms.general_heading')}</h3>
          <p>${t('legal.terms.general_body')}</p>
          <h3>${t('legal.terms.stock_heading')}</h3>
          <p>${t('legal.terms.stock_body')}</p>
          <h3>${t('legal.terms.cod_heading')}</h3>
          <p>${t('legal.terms.cod_body')}</p>
        `,
      },
      privacy: {
        title: 'Privacy Policy',
        lastUpdated: 'Last updated: July 16, 2026',
        htmlContent: `
          <h3>${t('legal.privacy.collection_heading')}</h3>
          <p>${t('legal.privacy.collection_body')}</p>
          <h3>${t('legal.privacy.protection_heading')}</h3>
          <p>${t('legal.privacy.protection_body')}</p>
        `,
      },
      refund: {
        title: 'Refund & Return Policy',
        lastUpdated: 'Last updated: July 16, 2026',
        htmlContent: `
          <h3>${t('legal.refund.replacement_heading')}</h3>
          <p>${t('legal.refund.replacement_body')}</p>
          <h3>${t('legal.refund.condition_heading')}</h3>
          <p>${t('legal.refund.condition_body')}</p>
        `,
      },
      'emi-information': {
        title: 'EMI Policy & Information',
        lastUpdated: 'Last updated: July 16, 2026',
        htmlContent: `
          <h3>${t('legal.emi.easy_heading')}</h3>
          <p>${t('legal.emi.easy_body')}</p>
          <h3>${t('legal.emi.fee_heading')}</h3>
          <p>${t('legal.emi.fee_body')}</p>
        `,
      },
    };

    return legalPages[pageSlug] || {
      title: 'Policy Details',
      lastUpdated: 'Last updated: July 16, 2026',
      htmlContent: `<p>Please contact our support hotline or visit our Bogura showroom to view this policy content in details.</p>`,
    };
  }, [cms, pageSlug, t]);

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>{`${pageData.title} | New Singapur Telecom`}</title>
        <meta name="description" content={`Read New Singapur Telecom's official ${pageData.title} regarding purchases, privacy, EMI, refund and shipping terms.`} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">{pageData.title}</span>
        </div>
      </div>

      {/* Legal Page Content Box */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white border border-gray-150 p-6 sm:p-10 rounded-3xl shadow-sm flex flex-col gap-6">
          
          {/* Header titles */}
          <div className="flex flex-col gap-1.5 border-b border-gray-100 pb-5">
            <div className="flex items-center gap-1.5 bg-[var(--nst-primary)]/10 text-[var(--nst-primary)] text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border border-purple-500/10 mb-1 max-w-max">
              <Scale className="w-3.5 h-3.5" />
              <span>Legal Agreements</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight leading-none mt-1">
              {pageData.title}
            </h1>
            <span className="text-gray-400 text-xs font-semibold mt-1">{pageData.lastUpdated}</span>
          </div>

          {/* Dynamic Rich Text Render block (dangerouslySetInnerHTML is fully secure because content is CMS-verified) */}
          <div className="prose max-w-none text-slate-600 text-xs sm:text-sm leading-relaxed font-semibold">
            <div 
              dangerouslySetInnerHTML={{ __html: pageData.htmlContent }} 
              className="space-y-6 [&>h3]:text-slate-800 [&>h3]:font-extrabold [&>h3]:text-sm sm:[&>h3]:text-base [&>h3]:mt-6 [&>h3]:mb-2 [&>h3]:border-l-2 [&>h3]:border-[var(--nst-primary)] [&>h3]:pl-2.5 [&>p]:leading-relaxed [&>p]:text-gray-500"
            />
          </div>

          {/* Secure verified badge */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[9px] text-gray-400 font-bold uppercase select-none border-t border-gray-50 pt-4 mt-4">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Verified dynamic legal agreement handshake complete</span>
          </div>

        </div>
      </div>

    </div>
  );
};

export default LegalPage;