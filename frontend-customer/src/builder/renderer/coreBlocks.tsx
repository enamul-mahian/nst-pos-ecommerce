import React from 'react';
import { Link } from 'react-router-dom';
import type { BlockComponentProps } from '../registry/blockRegistry';
import { registerBlock } from '../registry/blockRegistry';

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter((item) => record(item) === item).map(record) : [];
const contentOf = (props: BlockComponentProps) => ({ ...record(props.block.props), ...record(props.block.content) });

const SmartLink = ({ href, children }: { href: string; children: React.ReactNode }) => href.startsWith('http')
  ? <a href={href} rel="noreferrer">{children}</a>
  : <Link to={href}>{children}</Link>;

const ContainerBlock = ({ block, renderChildren }: BlockComponentProps) => (
  <section data-block-id={block.id} data-block-type={block.type}>{renderChildren(block.children)}</section>
);

const HeadingBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const value = text(content.text || content.title);
  const level = Number(content.level);
  if (!value) return null;
  if (level === 1) return <h1 data-block-id={props.block.id}>{value}</h1>;
  if (level === 2) return <h2 data-block-id={props.block.id}>{value}</h2>;
  if (level === 4) return <h4 data-block-id={props.block.id}>{value}</h4>;
  return <h3 data-block-id={props.block.id}>{value}</h3>;
};

const ParagraphBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const value = text(content.text || content.description || content.subtitle);
  return value ? <p data-block-id={props.block.id}>{value}</p> : null;
};

const RichTextBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const html = text(content.html);
  return html ? <div data-block-id={props.block.id} dangerouslySetInnerHTML={{ __html: html }} /> : null;
};

const ImageBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const src = text(content.src || content.url || content.imageUrl || content.image);
  return src ? <img data-block-id={props.block.id} src={src} alt={text(content.alt)} loading={content.eager === true ? 'eager' : 'lazy'} /> : null;
};

const LinkBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const href = text(content.href || content.path || content.url || content.actionPath);
  const label = text(content.label || content.text || content.actionLabel);
  if (!href || !label) return null;
  return <SmartLink href={href}><span data-block-id={props.block.id}>{label}</span></SmartLink>;
};

const SpacerBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const size = typeof content.size === 'number' ? content.size : 0;
  return <div data-block-id={props.block.id} aria-hidden="true" style={{ height: size }} />;
};

const SiteHeaderBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const site = record(content.site);
  const header = record(content.header);
  const links = list(header.links).filter((item) => item.enabled !== false);
  const logoUrl = text(site.logoUrl || site.mobileLogoUrl);
  const logoText = text(site.logoText || site.shortName || site.name);
  return (
    <header data-block-id={props.block.id} data-block-type={props.block.type}>
      <div>
        <SmartLink href="/">{logoUrl ? <img src={logoUrl} alt={text(site.name)} /> : <span>{logoText}</span>}</SmartLink>
        <nav>{links.map((item, index) => {
          const href = text(item.path);
          const label = text(item.label);
          return href && label ? <SmartLink key={`${href}-${index}`} href={href}>{label}</SmartLink> : null;
        })}</nav>
      </div>
    </header>
  );
};

const HeroBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const buttons = list(content.buttons);
  const prefix = Array.isArray(content.headlinePrefix) ? content.headlinePrefix.map(text).filter(Boolean).join(' ') : '';
  const rotating = Array.isArray(content.rotatingWords) ? content.rotatingWords.map(text).filter(Boolean) : [];
  const title = [prefix, rotating[0] || text(content.title)].filter(Boolean).join(' ');
  return (
    <section data-block-id={props.block.id} data-block-type={props.block.type}>
      {text(content.badge) ? <span>{text(content.badge)}</span> : null}
      {title ? <h1>{title}</h1> : null}
      {text(content.subtitle) ? <p>{text(content.subtitle)}</p> : null}
      <div>{buttons.map((item, index) => {
        const href = text(item.path);
        const label = text(item.label);
        return href && label ? <SmartLink key={`${href}-${index}`} href={href}>{label}</SmartLink> : null;
      })}</div>
    </section>
  );
};

const ContentSectionBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const items = list(content.items);
  return (
    <section data-block-id={props.block.id} data-block-type={props.block.type}>
      {text(content.eyebrow) ? <span>{text(content.eyebrow)}</span> : null}
      {text(content.title) ? <h2>{text(content.title)}</h2> : null}
      {text(content.description) ? <p>{text(content.description)}</p> : null}
      {items.length ? <div>{items.map((item, index) => {
        const href = text(item.path || item.actionPath || item.link);
        const label = text(item.actionLabel || item.label);
        const card = <article>
          {text(item.image || item.imageUrl) ? <img src={text(item.image || item.imageUrl)} alt={text(item.title)} loading="lazy" /> : null}
          {text(item.title) ? <h3>{text(item.title)}</h3> : null}
          {text(item.subtitle || item.description || item.text) ? <p>{text(item.subtitle || item.description || item.text)}</p> : null}
          {href && label ? <SmartLink href={href}>{label}</SmartLink> : null}
        </article>;
        return <React.Fragment key={`${props.block.id}-${index}`}>{card}</React.Fragment>;
      })}</div> : null}
    </section>
  );
};

const SiteFooterBlock = (props: BlockComponentProps) => {
  const content = contentOf(props);
  const columns = list(content.columns).filter((column) => column.enabled !== false);
  return (
    <footer data-block-id={props.block.id} data-block-type={props.block.type}>
      {text(content.logoUrl) ? <img src={text(content.logoUrl)} alt={text(content.brandName)} /> : null}
      {text(content.brandName || content.logoText) ? <strong>{text(content.brandName || content.logoText)}</strong> : null}
      {text(content.description || content.tagline) ? <p>{text(content.description || content.tagline)}</p> : null}
      <div>{columns.map((column, columnIndex) => <section key={`${props.block.id}-column-${columnIndex}`}>
        {text(column.title) ? <h3>{text(column.title)}</h3> : null}
        {list(column.links).filter((item) => item.enabled !== false).map((item, linkIndex) => {
          const href = text(item.path);
          const label = text(item.label);
          return href && label ? <SmartLink key={`${href}-${linkIndex}`} href={href}>{label}</SmartLink> : null;
        })}
      </section>)}</div>
      {text(content.copyright) ? <small>{text(content.copyright)}</small> : null}
    </footer>
  );
};

export const registerCoreBlocks = (): void => {
  registerBlock('container', ContainerBlock);
  registerBlock('section', ContainerBlock);
  registerBlock('group', ContainerBlock);
  registerBlock('rich_text', RichTextBlock);
  registerBlock('heading', HeadingBlock);
  registerBlock('text', ParagraphBlock);
  registerBlock('text_block', ContentSectionBlock);
  registerBlock('paragraph', ParagraphBlock);
  registerBlock('image', ImageBlock);
  registerBlock('link', LinkBlock);
  registerBlock('button', LinkBlock);
  registerBlock('spacer', SpacerBlock);
  registerBlock('site_header', SiteHeaderBlock);
  registerBlock('header', SiteHeaderBlock);
  registerBlock('hero', HeroBlock);
  registerBlock('image_slider', HeroBlock);
  registerBlock('site_footer', SiteFooterBlock);
  registerBlock('footer', SiteFooterBlock);
  registerBlock('feature_grid', ContentSectionBlock);
  registerBlock('features_grid', ContentSectionBlock);
  registerBlock('deals', ContentSectionBlock);
  registerBlock('product_grid', ContentSectionBlock);
  registerBlock('category_grid', ContentSectionBlock);
  registerBlock('brand_showcase', ContentSectionBlock);
  registerBlock('blog_posts', ContentSectionBlock);
};
