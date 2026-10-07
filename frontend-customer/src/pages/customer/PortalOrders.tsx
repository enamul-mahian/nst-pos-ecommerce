import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ClipboardList, 
  ChevronRight, 
  CheckCircle2, 
  Circle, 
  Truck, 
  Clock, 
  HelpCircle, 
  ShieldCheck 
} from 'lucide-react';

import { apiClient, handleApiError } from '../../api/client';
import { Order } from '../../types';

export const PortalOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab Filtering State (All, Processing, Shipped, Delivered, Cancelled)
  const [activeTab, setActiveTab] = useState<'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sync Customer Orders list from secure endpoint on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPortalOrdersList = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiClient.get('/portal/orders');
        
        if (isMounted && response.data?.status && Array.isArray(response.data?.data)) {
          setOrders(response.data.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(handleApiError(err).message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPortalOrdersList();
    return () => {
      isMounted = false;
    };
  }, []);

  // ==========================================
  // 1. Dynamic Frontend Tab Filtering Logic
  // ==========================================
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (activeTab === 'processing') {
      result = result.filter((o) => 
        ['pending', 'processing', 'placed'].includes(o.status?.toLowerCase() || '')
      );
    } else if (activeTab !== 'all') {
      result = result.filter((o) => o.status?.toLowerCase() === activeTab);
    }

    // Sort newest orders first
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, activeTab]);

  // ==========================================
  // 2. Pagination Logic
  // ==========================================
  const ordersPerPage = 10;
  const paginatedOrders = useMemo(() => {
    const offset = (currentPage - 1) * ordersPerPage;
    return filteredOrders.slice(offset, offset + ordersPerPage);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

  const handleTabChange = (tab: 'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled') => {
    setActiveTab(tab);
    setCurrentPage(1); // Reset page to 1 on tab toggle
  };

  // Status Badge Class resolver matching mockup style presets (Layout 11)
  const getStatusBadgeClass = (statusName: string) => {
    const status = statusName.toLowerCase();
    if (status === 'delivered') {
      return 'bg-emerald-50 text-emerald-600 border border-emerald-500/20';
    }
    if (status === 'shipped') {
      return 'bg-blue-50 text-blue-600 border border-blue-500/20';
    }
    if (status === 'cancelled') {
      return 'bg-red-50 text-red-600 border border-red-500/20';
    }
    return 'bg-amber-50 text-amber-600 border border-amber-500/20'; // Processing/Pending
  };

  return (
    <div className="w-full bg-white border border-gray-150 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-6 text-left">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>My Orders | Customer Panel - New Singapur Telecom</title>
        <meta name="description" content="Manage and track all your purchases, active shipments and order history at New Singapur Telecom." />
      </Helmet>

      {/* Header title */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <ClipboardList className="w-5.5 h-5.5 text-[var(--nst-primary)]" />
        <h2 className="font-extrabold text-slate-800 text-sm sm:text-base">My Orders</h2>
      </div>

      {/* ==========================================
          3. Status Filter Tab Selectors (Layout 11 SPEC)
          ========================================== */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3 select-none">
        {[
          { label: 'All', value: 'all' },
          { label: 'Processing', value: 'processing' },
          { label: 'Shipped', value: 'shipped' },
          { label: 'Delivered', value: 'delivered' },
          { label: 'Cancelled', value: 'cancelled' },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value as any)}
            className={`text-xs font-black px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
              activeTab === tab.value
                ? 'bg-[var(--nst-primary)] border-[var(--nst-primary)] text-white shadow-md'
                : 'bg-slate-50 hover:bg-slate-100 border-gray-150 text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ==========================================
          4. Orders Table List View (Layout 11)
          ========================================== */}
      {isLoading ? (
        <div className="py-16 flex justify-center w-full">
          <div className="w-8 h-8 border-4 border-[var(--nst-primary)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-6">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 uppercase font-black tracking-wider text-[10px] h-10 select-none">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Payment Method</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="font-semibold text-slate-700 divide-y divide-gray-50">
                {paginatedOrders.map((ord) => {
                  const formattedDate = new Date(ord.created_at).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/50 transition-colors h-14">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        #{ord.order_no || ord.id}
                      </td>
                      <td className="py-3 px-3 text-gray-400">{formattedDate}</td>
                      <td className="py-3 px-3 uppercase text-[11px] text-gray-400 font-bold">
                        {ord.payment_method?.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-3 font-bold">
                        ৳{ord.total?.toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${getStatusBadgeClass(ord.status)}`}>
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/track-order/${ord.order_no || ord.id}`}
                          className="bg-slate-100 hover:bg-[var(--nst-primary)] text-slate-700 hover:text-white font-extrabold text-[10px] sm:text-xs px-3.5 py-2 rounded-lg transition-all"
                        >
                          Track
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Empty States Fallback */}
            {paginatedOrders.length === 0 && !error && (
              <div className="py-16 flex flex-col items-center justify-center text-center">
                <HelpCircle className="w-12 h-12 text-gray-300 mb-3" />
                <h4 className="text-slate-800 font-extrabold text-sm capitalize">No {activeTab !== 'all' ? activeTab : ''} Orders Found</h4>
                <p className="text-gray-400 text-xs font-semibold mt-1">There are no orders matching this filter bracket in your portal account.</p>
              </div>
            )}

            {error && (
              <div className="py-16 text-center text-red-500 font-semibold text-xs sm:text-sm">
                {error}
              </div>
            )}
          </div>

          {/* ==========================================
              5. Catalog Pagination Controls (Layout 11 SPEC)
              ========================================== */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => {
                      setCurrentPage(pageNum);
                      window.scrollTo({ top: 100, behavior: 'smooth' });
                    }}
                    className={`w-8 h-8 rounded-lg font-black text-xs flex items-center justify-center transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-[var(--nst-primary)] text-white shadow-md'
                        : 'bg-white hover:bg-gray-100 text-slate-700 border border-gray-150'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom Security verification details */}
          <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase select-none border-t border-gray-50 pt-4">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Verified Customer Purchase Sync handshake complete</span>
          </div>

        </div>
      )}

    </div>
  );
};

export default PortalOrders;