import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Calendar, ChevronRight, Clock, Search } from 'lucide-react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

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

export const BlogPage: React.FC = () => {
  const { cms } = useWebsiteStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const allBlogs = useMemo<BlogItem[]>(() => {
    const rows = (cms as any)?.blogs;
    return Array.isArray(rows) ? rows.filter((blog) => blog && blog.enabled !== false && blog.title) : [];
  }, [cms]);

  const filteredBlogs = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return allBlogs;

    return allBlogs.filter((blog) =>
      [blog.title, blog.summary, blog.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [allBlogs, searchTerm]);

  const itemsPerPage = 6;
  const totalPages = Math.max(1, Math.ceil(filteredBlogs.length / itemsPerPage));
  const paginatedBlogs = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const offset = (safePage - 1) * itemsPerPage;
    return filteredBlogs.slice(offset, offset + itemsPerPage);
  }, [currentPage, filteredBlogs, totalPages]);

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] pb-16 text-left">
      <Helmet>
        <title>Blog & Tech Guides | New Singapur Telecom</title>
        <meta name="description" content="Read the active guides, news and articles published by New Singapur Telecom." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="border-b border-gray-200 bg-white px-4 py-3.5 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="font-extrabold text-slate-800">Blogs & Tech Tips</span>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 gap-8 px-4 lg:grid-cols-4">
        <div className="flex flex-col gap-7 lg:col-span-3">
          <div className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xl font-black text-slate-800 sm:text-2xl">
              <BookOpen className="h-6 w-6 text-[var(--nst-primary)]" />
              Latest News & Tips
            </div>
            <span className="text-xs font-semibold text-gray-400">{filteredBlogs.length} published article(s)</span>
          </div>

          {paginatedBlogs.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {paginatedBlogs.map((blog) => (
                <article key={String(blog.id)} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                  {blog.imageUrl ? (
                    <div className="h-48 overflow-hidden bg-slate-100">
                      <img src={blog.imageUrl} alt={blog.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                    </div>
                  ) : (
                    <div className="grid h-32 place-items-center bg-slate-100 text-slate-300">
                      <BookOpen className="h-10 w-10" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-5">
                    <span className="max-w-max rounded-full bg-[var(--nst-primary)]/10 px-3 py-1 text-[10px] font-black uppercase text-[var(--nst-primary)]">
                      {blog.category || 'Article'}
                    </span>
                    <h2 className="mt-3 line-clamp-2 text-lg font-black text-slate-800">{blog.title}</h2>
                    {blog.summary && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{blog.summary}</p>}

                    <div className="mt-auto flex items-center gap-3 pt-5 text-[11px] font-bold text-gray-400">
                      {blog.publishDate && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{blog.publishDate}</span>}
                      {blog.readingTime && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{blog.readingTime}</span>}
                    </div>

                    <Link to={`/${encodeURIComponent(blogSlug(blog))}`} className="mt-4 text-sm font-black text-[#138a52]">
                      Read article →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
              <h2 className="mt-3 font-black text-slate-800">No published articles found</h2>
              <p className="mt-2 text-sm text-slate-500">
                Publish a blog from Website CMS, or change the search phrase.
              </p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentPage(index + 1)}
                  className={`h-9 w-9 rounded-lg text-xs font-black ${currentPage === index + 1 ? 'bg-[var(--nst-primary)] text-white' : 'border border-gray-200 bg-white text-slate-600'}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="h-max rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="text-xs font-black uppercase text-slate-500">
            Search Articles
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Title, category or keyword"
              />
            </span>
          </label>
        </aside>
      </div>
    </div>
  );
};

export default BlogPage;
