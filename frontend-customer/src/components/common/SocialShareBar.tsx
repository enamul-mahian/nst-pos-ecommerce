import React, { useMemo, useState } from 'react';
import { Copy, Facebook, Link2, Send, Share2 } from 'lucide-react';

type SocialShareBarProps = {
  title: string;
  text?: string;
  url?: string;
  label?: string;
};

export const SocialShareBar: React.FC<SocialShareBarProps> = ({
  title,
  text = '',
  url,
  label = 'Share',
}) => {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(text || title);

  const links = useMemo(() => ([
    {
      key: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      Icon: Facebook,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      Icon: Send,
    },
  ]), [encodedText, encodedUrl]);

  const nativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url: shareUrl });
      return;
    }

    await copyLink();
  };

  const copyLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="mr-1 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        <Share2 className="h-4 w-4" />
        {label}
      </span>

      <button
        type="button"
        onClick={() => void nativeShare()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[var(--nst-primary)] hover:text-[var(--nst-primary)]"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>

      {links.map(({ key, label: itemLabel, href, Icon }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[var(--nst-primary)] hover:text-[var(--nst-primary)]"
        >
          <Icon className="h-4 w-4" />
          {itemLabel}
        </a>
      ))}

      <button
        type="button"
        onClick={() => void copyLink()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[var(--nst-primary)] hover:text-[var(--nst-primary)]"
      >
        {copied ? <Copy className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy Link'}
      </button>
    </div>
  );
};

export default SocialShareBar;
