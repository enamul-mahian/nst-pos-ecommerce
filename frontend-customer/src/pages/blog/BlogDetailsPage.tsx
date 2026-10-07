import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Calendar, ChevronRight, Clock, ShieldCheck } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import SocialShareBar from '../../components/common/SocialShareBar';

type BlogItem = {
  id: number | string;
  slug?: string;
  title: string;
  publishDate?: string;
  imageUrl?: string;
  summary?: string;
  path?: string;
  readingTime?: string;
  category?: string;
  contentHtml?: string;
  enabled?: boolean;
};

const blogSlug = (blog: BlogItem): string => {
  if (blog.slug) return blog.slug;
  const pathSlug = String(blog.path || '').split('/').filter(Boolean).pop();
  return pathSlug || String(blog.id);
};

export const BlogDetailsPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { cms } = useWebsiteStore();

  const blogs = useMemo<BlogItem[]>(() => {
    const rows = (cms as any)?.blogs;
    return Array.isArray(rows) ? rows.filter((blog) => blog && blog.enabled !== false && blog.title) : [];
  }, [cms]);

  const activeBlog = useMemo(
    () => blogs.find((blog) => blogSlug(blog) === slug || String(blog.id) === slug) || null,
    [blogs, slug],
  );

  const recentArticles = useMemo(
    () => blogs.filter((blog) => activeBlog && String(blog.id) !== String(activeBlog.id)).slice(0, 3),
    [activeBlog, blogs],
  );

  if (!activeBlog) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-xl font-black text-slate-800">Article not found</h1>
        <p className="mt-2 text-sm text-slate-500">This article is not published or the link is no longer active.</p>
        <Link to="/blog" className="mt-5 inline-flex rounded-xl bg-[var(--nst-primary)] px-5 py-3 text-sm font-black text-white">
          Back to Blogs
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] pb-16 text-left">
      <Helmet>
        <title>{`${activeBlog.title} | New Singapur Telecom`}</title>
        <meta name="description" content={activeBlog.summary || activeBlog.title} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="border-b border-gray-200 bg-white px-4 py-3.5 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5">
          <Link to="/">Home</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <Link to="/blog">Blogs</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="truncate font-extrabold text-slate-800">{activeBlog.title}</span>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 gap-8 px-4 lg:grid-cols-4">
        <article className="flex flex-col gap-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10 lg:col-span-3">
          <button type="button" onClick={() => navigate('/blog')} className="inline-flex max-w-max items-center gap-1 text-xs font-extrabold text-[var(--nst-primary)]">
            <ArrowLeft className="h-4 w-4" />
            Back to Blogs
          </button>

          <header className="border-b border-gray-100 pb-5">
            <span className="max-w-max rounded-md border border-purple-500/10 bg-[var(--nst-primary)]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--nst-primary)]">
              {activeBlog.category || 'Article'}
            </span>
            <h1 className="mt-4 text-2xl font-black leading-tight text-slate-800 sm:text-4xl">{activeBlog.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-gray-400">
              {activeBlog.publishDate && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{activeBlog.publishDate}</span>}
              {activeBlog.readingTime && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{activeBlog.readingTime}</span>}
            </div>
          </header>

          {activeBlog.imageUrl && (
            <div className="h-52 w-full overflow-hidden rounded-2xl bg-slate-100 sm:h-[380px]">
              <img src={activeBlog.imageUrl} alt={activeBlog.title} className="h-full w-full object-cover" />
            </div>
          )}

          <SocialShareBar title={activeBlog.title} text={activeBlog.summary} label="Share article" />

          <div
            className="prose max-w-none text-sm leading-7 text-slate-600"
            dangerouslySetInnerHTML={{ __html: activeBlog.contentHtml || activeBlog.summary || '' }}
          />

          <div className="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-5 text-[10px] font-bold uppercase text-gray-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>Published from the NST Website CMS</span>
          </div>
        </article>

        <aside className="h-max rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-gray-100 pb-3 text-sm font-extrabold text-slate-800">
            <BookOpen className="h-4 w-4 text-[var(--nst-primary)]" />
            Recent Articles
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            {recentArticles.length > 0 ? recentArticles.map((recent) => (
              <Link key={String(recent.id)} to={`/blog/${encodeURIComponent(blogSlug(recent))}`} className="group flex items-center gap-3">
                {recent.imageUrl ? (
                  <img src={recent.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100"><BookOpen className="h-5 w-5 text-slate-300" /></span>
                )}
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-slate-800 group-hover:text-[var(--nst-primary)]">{recent.title}</strong>
                  {recent.publishDate && <small className="mt-1 block text-[10px] font-bold uppercase text-gray-400">{recent.publishDate}</small>}
                </span>
              </Link>
            )) : <p className="text-sm text-slate-500">No other published articles.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BlogDetailsPage;
