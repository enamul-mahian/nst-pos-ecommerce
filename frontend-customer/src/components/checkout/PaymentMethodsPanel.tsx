import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Truck } from 'lucide-react';
import { apiClient } from '../../api/client';

type PaymentOption = {
  key: string;
  label: string;
  enabled: boolean;
  online?: boolean;
  mode?: string;
  configured?: boolean;
  requires_transaction_id?: boolean;
  agent_number?: string | null;
};

type Props = {
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
};

const allowedCheckoutMethods = new Set(['sslcommerz', 'piprapay', 'cash_on_delivery']);

export const PaymentMethodsPanel: React.FC<Props> = ({ paymentMethod, setPaymentMethod }) => {
  const [options, setOptions] = useState<PaymentOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiClient.get('/public/payment-options')
      .then((response) => {
        if (!active) return;
        const rows = response.data?.data?.options;
        setOptions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!active) return;
        // Do not invent an online gateway when the API is unavailable.
        setOptions([
          { key: 'cash_on_delivery', label: 'Cash on Delivery', enabled: true, online: false },
        ]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleOptions = useMemo(
    () => options.filter((option) => option.enabled && allowedCheckoutMethods.has(option.key)),
    [options],
  );

  useEffect(() => {
    if (loading || visibleOptions.length === 0) return;

    if (!visibleOptions.some((option) => option.key === paymentMethod)) {
      setPaymentMethod(visibleOptions[0].key);
    }
  }, [loading, visibleOptions, paymentMethod, setPaymentMethod]);

  return (
    <div className="bg-white border border-gray-150 p-6 sm:p-8 rounded-2xl shadow-sm flex flex-col gap-4">
      <h2 className="text-sm sm:text-base font-extrabold text-slate-800 border-b border-gray-100 pb-3 flex items-center gap-2 uppercase tracking-wider">
        <CreditCard className="w-4.5 h-4.5 text-[var(--nst-primary)]" />
        <span>Payment Method</span>
      </h2>

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
          Loading available payment methods...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleOptions.map((option) => {
            const online = option.key === 'sslcommerz' || option.key === 'piprapay';

            return (
              <label
                key={option.key}
                className={`border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all ${
                  paymentMethod === option.key
                    ? 'border-[var(--nst-primary)] bg-[var(--nst-primary)]/5 text-[var(--nst-primary)] ring-2 ring-[var(--nst-primary)]/20'
                    : 'border-gray-150 text-slate-700 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment_option"
                      checked={paymentMethod === option.key}
                      onChange={() => setPaymentMethod(option.key)}
                      className="accent-[var(--nst-primary)] h-4 w-4"
                    />
                    <div className="flex flex-col text-left">
                      <span className="font-extrabold text-sm sm:text-base text-slate-800">
                        {option.label}
                      </span>
                      {online && (
                        <span className="mt-1 text-[10px] font-bold text-gray-400">
                          Secure online payment{option.mode ? ` · ${option.mode}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {online ? (
                    <CreditCard className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Truck className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </label>
            );
          })}

          {!visibleOptions.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              No checkout payment method is currently enabled.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentMethodsPanel;
