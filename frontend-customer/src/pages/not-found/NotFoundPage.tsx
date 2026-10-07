import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldAlert, Home, ArrowLeft, Sparkles } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0c051a] flex flex-col justify-center items-center py-12 px-4 relative overflow-hidden select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>404 Page Not Found | New Singapur Telecom</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Decorative glowing gradient inside background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl pointer-events-none z-0"></div>

      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 sm:p-10 z-10 relative flex flex-col items-center text-center">
        
        {/* pad icon with purple style */}
        <div className="bg-[var(--nst-primary)]/10 p-4 rounded-full text-[var(--nst-primary)] shadow-sm mb-6 animate-pulse relative">
          <div className="absolute inset-0 rounded-full bg-[var(--nst-primary)]/5 animate-ping"></div>
          <ShieldAlert className="w-10 h-10 stroke-[2.5]" />
        </div>

        {/* 404 Large Label */}
        <h1 className="text-6xl sm:text-7xl font-black text-slate-800 tracking-tight leading-none">
          404
        </h1>

        <h2 className="text-slate-800 font-extrabold text-lg sm:text-xl mt-4">
          Page Not Found
        </h2>
        
        <p className="text-gray-400 text-xs sm:text-sm font-semibold mt-2.5 leading-relaxed max-w-[280px] mx-auto">
          The page you are looking for might have been removed, had its name changed or is temporarily unavailable.
        </p>

        {/* Action Button Links */}
        <div className="flex flex-col gap-3 w-full mt-8">
          <Link
            to="/"
            className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Go Back Home</span>
          </Link>

          <Link
            to="/products"
            className="w-full border border-gray-200 text-slate-700 hover:bg-slate-50 font-black text-xs sm:text-sm py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Browse Products</span>
          </Link>
        </div>

        {/* Dynamic bottom brand badge */}
        <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase select-none border-t border-gray-50 pt-4 mt-6 w-full justify-center">
          <Sparkles className="w-3.5 h-3.5 text-[#ffb800]" />
          <span>New Singapur Telecom</span>
        </div>

      </div>
    </div>
  );
};

export default NotFoundPage;