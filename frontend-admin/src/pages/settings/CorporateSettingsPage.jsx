import { Link } from 'react-router-dom';
import { ArrowRight, Settings2 } from 'lucide-react';
import { BusinessOsIcon } from '../../config/businessOsIconRegistry';
import { NstCard, NstPageShell } from '../../components/ui';
import { corporateSettingsDomains } from './corporate/corporateSettingsRegistry';

export default function CorporateSettingsPage() {
  return (
    <NstPageShell
      icon={Settings2}
      eyebrow="Settings"
      title="Corporate Settings"
      description="Each settings domain now has its own route and responsibility. This keeps configuration maintainable without changing the existing backend section APIs."
      maxWidth="1450px"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {corporateSettingsDomains.map((item) => {
          const Icon = item.icon || Settings2;
          return (
            <Link key={item.key} to={item.path} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nst-dashboard-primary)]">
              <NstCard className="h-full transition group-hover:-translate-y-0.5 group-hover:border-[var(--nst-dashboard-primary)] group-hover:shadow-md" contentClassName="h-full">
                <div className="flex h-full items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] text-[var(--nst-dashboard-primary)]">
                    <BusinessOsIcon icon={Icon} size={20}/>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-black">{item.title}</h2>
                    <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">{item.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-[var(--nst-dashboard-primary)]">Open settings <ArrowRight size={14}/></span>
                  </div>
                </div>
              </NstCard>
            </Link>
          );
        })}
      </div>
    </NstPageShell>
  );
}
