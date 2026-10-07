import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ChevronRight, 
  BadgePercent, 
  Copy, 
  Check, 
  Sparkles, 
  Smartphone, 
  RefreshCw, 
  GraduationCap, 
  CreditCard, 
  ShieldCheck 
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

interface CampaignCard {
  title: string;
  subtitle: string;
  highlight: string;
  description: string;
  actionLabel: string;
  actionPath: string;
  badgeColor: string;
}

interface CouponModel {
  code: string;
  discountValue: string;
  description: string;
  expiryDate: string;
}

export const OffersPage: React.FC = () => {
  const { cms } = useWebsiteStore();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Dynamic Special Offers Banners List (Layout 13 spec)
  const campaignsList: CampaignCard[] = (cms as any)?.specialOffers || [
    {
      title: 'Pre Order Now',
      subtitle: 'Ensure First Delivery',
      highlight: 'Reserve Today',
      description: 'Book your upcoming flagship devices with a priority token booking payment.',
      actionLabel: 'Book Now',
      actionPath: '/preorder',
      badgeColor: 'from-[#1e1b4b] to-[#311042]',
    },
    {
      title: 'Exchange Offer',
      subtitle: 'Extra Value on Exchange',
      highlight: 'Up to ৳15,000',
      description: 'Upgrade your device! Swap your old functional smartphone for the best trade-in price.',
      actionLabel: 'Know More',
      actionPath: '/contact',
      badgeColor: 'from-[var(--nst-primary-deep)] to-[#022c22]',
    },
    {
      title: 'Student Discount',
      subtitle: 'On Selected Products',
      highlight: 'Extra 5% Off',
      description: 'Exclusive academic concession program for tech equipment, laptops and tablets.',
      actionLabel: 'Verify Now',
      actionPath: '/contact',
      badgeColor: 'from-[#7c2d12] to-[#451a03]',
    },
    {
      title: 'Bank Discount',
      subtitle: 'On EMI Transactions',
      highlight: 'Up to 10% Off',
      description: 'Get additional cashback discounts across major associated leading banks.',
      actionLabel: 'View Banks',
      actionPath: '/legal/emi-information',
      badgeColor: 'from-[#1e3a8a] to-[#172554]',
    },
  ];

  // Dynamic active coupons list
  const activeCoupons: CouponModel[] = [
    {
      code: 'NSTFIRST500',
      discountValue: '৳500 OFF',
      description: 'Get ৳500 instant discount on your first order. Minimum cart value ৳20,000.',
      expiryDate: 'Valid till 31 Dec, 2026',
    },
    {
      code: 'ACCEXTRA10',
      discountValue: '10% OFF',
      description: 'Get 10% off on all premium accessories and gadgets. Maximum discount ৳1,000.',
      expiryDate: 'Valid till 30 Sep, 2026',
    },
    {
      code: 'EMICASHBACK',
      discountValue: '৳1,500 CASHBACK',
      description: 'Get ৳1,500 cashback on credit card transactions with selected partner banks.',
      expiryDate: 'Valid till 31 Oct, 2026',
    },
  ];

  // Copy to Clipboard Utility function
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Coupon code "${code}" copied to clipboard!`);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000); // Reset icon status after 2 seconds
  };

  const getCampaignIcon = (index: number) => {
    switch (index) {
      case 0: return <Smartphone className="w-8 h-8 text-[#ffb800] stroke-[1.5]" />;
      case 1: return <RefreshCw className="w-8 h-8 text-[#ffb800] stroke-[1.5]" />;
      case 2: return <GraduationCap className="w-8 h-8 text-[#ffb800] stroke-[1.5]" />;
      default: return <CreditCard className="w-8 h-8 text-[#ffb800] stroke-[1.5]" />;
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Special Discounts & Promotional Offers | New Singapur Telecom</title>
        <meta name="description" content="Explore active discount coupons, student concessions, trade-in exchange bonuses and bank cashback campaigns at New Singapur Telecom." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Offers & Campaigns</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 flex flex-col gap-12">
        
        {/* ==========================================
            Section 1: Active Promotional Campaigns (Layout 13)
            ========================================== */}
        <div className="flex flex-col gap-6 w-full">
          <div className="flex items-center gap-2 font-black text-slate-800 text-lg sm:text-2xl tracking-tight border-b border-gray-200 pb-3">
            <Sparkles className="w-6 h-6 text-[var(--nst-primary)]" />
            <span>Special Promotional Deals</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
            {campaignsList.map((offer, idx) => (
              <div
                key={idx}
                className={`rounded-3xl p-6 bg-gradient-to-br ${offer.badgeColor} border border-white/5 shadow-xl flex flex-col justify-between text-left relative overflow-hidden group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 h-[280px] sm:h-[300px]`}
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>
                
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white/60 text-[10px] uppercase font-bold tracking-widest block">
                      {offer.subtitle}
                    </span>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10 group-hover:bg-white/10 transition-colors">
                      {getCampaignIcon(idx)}
                    </div>
                  </div>

                  <h3 className="text-white font-extrabold text-lg sm:text-xl tracking-tight mb-1">
                    {offer.title}
                  </h3>
                  
                  <span className="text-[#ffb800] font-black text-base tracking-wide uppercase mb-3 block">
                    {offer.highlight}
                  </span>

                  <p className="text-gray-300 text-xs sm:text-sm leading-relaxed font-semibold line-clamp-3">
                    {offer.description}
                  </p>
                </div>

                <Link
                  to={offer.actionPath}
                  className="bg-white/10 text-white hover:bg-[var(--nst-primary)] hover:border-transparent font-extrabold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 border border-white/10 mt-6 max-w-max transition-all shadow cursor-pointer"
                >
                  <span>{offer.actionLabel}</span>
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* ==========================================
            Section 2: Interactive Coupon Codes
            ========================================== */}
        <div className="flex flex-col gap-6 w-full">
          <div className="flex items-center gap-2 font-black text-slate-800 text-lg sm:text-2xl tracking-tight border-b border-gray-200 pb-3">
            <BadgePercent className="w-6 h-6 text-[var(--nst-primary)]" />
            <span>Active Discount Coupons</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {activeCoupons.map((coupon) => (
              <div
                key={coupon.code}
                className="bg-white border border-gray-150 rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative text-left"
              >
                <div className="flex flex-col">
                  {/* Coupon value flag */}
                  <span className="bg-[var(--nst-primary)]/10 text-[var(--nst-primary)] font-black text-xs px-3 py-1 rounded-full max-w-max border border-purple-500/10 mb-4 block">
                    {coupon.discountValue}
                  </span>

                  <p className="text-slate-600 font-semibold text-xs sm:text-sm leading-relaxed mb-4">
                    {coupon.description}
                  </p>
                </div>

                {/* Interactive Copy Code Area */}
                <div className="flex flex-col gap-2 mt-auto">
                  <div className="flex items-center justify-between bg-slate-50 border border-gray-200 p-2.5 rounded-xl">
                    <span className="font-mono font-bold text-slate-800 tracking-tight text-xs sm:text-sm">
                      {coupon.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(coupon.code)}
                      className={`flex items-center gap-1 font-bold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        copiedCode === coupon.code
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[var(--nst-ink)] hover:bg-[var(--nst-primary)] text-white'
                      }`}
                    >
                      {copiedCode === coupon.code ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold block text-right">
                    {coupon.expiryDate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OffersPage;