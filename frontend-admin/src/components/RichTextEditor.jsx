import { useEffect, useRef } from 'react';

export default function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;

    if (document.activeElement !== editorRef.current) {
      const cleanedValue = cleanHtml(value || '');

      if (editorRef.current.innerHTML !== cleanedValue) {
        editorRef.current.innerHTML = cleanedValue;
      }
    }
  }, [value]);

  const updateValue = () => {
    if (!editorRef.current) return;

    const cleaned = cleanHtml(editorRef.current.innerHTML);
    onChange(cleaned);
  };

  const runCommand = (command, argument = null) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    document.execCommand(command, false, argument);
    updateValue();
  };

  const insertHtmlAtCursor = (html) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    document.execCommand('insertHTML', false, html);
    updateValue();
  };

  const addLink = () => {
    const url = window.prompt('Enter link URL');

    if (!url) return;

    runCommand('createLink', url);
  };

  const insertTable = () => {
    const rows = Number(window.prompt('Rows?', '3')) || 3;
    const cols = Number(window.prompt('Columns?', '2')) || 2;

    let table = '<table class="nst-product-table"><tbody>';

    for (let r = 0; r < rows; r += 1) {
      table += '<tr>';

      for (let c = 0; c < cols; c += 1) {
        if (r === 0) {
          table += '<th>Heading</th>';
        } else {
          table += '<td>Data</td>';
        }
      }

      table += '</tr>';
    }

    table += '</tbody></table><p><br></p>';

    insertHtmlAtCursor(table);
  };

  const handlePaste = (e) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    e.preventDefault();

    if (html) {
      const convertedHtml = convertPastedHtmlToTableOnly(html);
      insertHtmlAtCursor(convertedHtml);
      return;
    }

    if (text) {
      insertHtmlAtCursor(convertPlainTextToParagraphs(text));
    }
  };

  function convertPastedHtmlToTableOnly(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    removeDangerousElements(template.content);

    const sectionTables = extractSpecificationSections(template.content);

    if (sectionTables.trim()) {
      return sectionTables;
    }

    const normalTables = extractNormalTables(template.content);

    if (normalTables.trim()) {
      return normalTables;
    }

    const fallbackRows = extractSpecRows(template.content);

    if (fallbackRows.length > 0) {
      return buildTable(fallbackRows);
    }

    return convertPlainTextToParagraphs(getCleanText(template.content));
  }

  function extractSpecificationSections(root) {
    const headings = Array.from(root.querySelectorAll('button, h1, h2, h3, h4'));
    const usedSectionKeys = new Set();

    let output = '';

    headings.forEach((heading) => {
      const title = getCleanText(heading);

      if (!isGoodHeading(title)) return;

      const sectionRoot =
        heading.closest('div[data-orientation="vertical"]') ||
        heading.closest('div[data-state]') ||
        heading.parentElement?.nextElementSibling ||
        heading.parentElement?.parentElement;

      if (!sectionRoot) return;

      const rows = extractSpecRows(sectionRoot);

      if (rows.length === 0) return;

      const sectionKey = title + JSON.stringify(rows);

      if (usedSectionKeys.has(sectionKey)) return;

      usedSectionKeys.add(sectionKey);

      output += `<h3>${escapeHtml(title)}</h3>`;
      output += buildTable(rows);
    });

    return output;
  }

  function extractNormalTables(root) {
    const tables = Array.from(root.querySelectorAll('table'));

    let output = '';

    tables.forEach((table) => {
      const rows = [];

      Array.from(table.querySelectorAll('tr')).forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('th, td'))
          .map((cell) => getCleanText(cell))
          .filter(Boolean);

        if (cells.length > 0) {
          rows.push(cells);
        }
      });

      if (rows.length > 0) {
        output += buildFlexibleTable(rows);
      }
    });

    return output;
  }

  function extractSpecRows(root) {
    const candidates = Array.from(root.querySelectorAll('tr, div, li'));
    const rows = [];
    const used = new Set();

    candidates.forEach((candidate) => {
      let cells = [];

      if (candidate.tagName === 'TR') {
        cells = Array.from(candidate.querySelectorAll('th, td'))
          .map((cell) => getCleanText(cell))
          .filter(Boolean);
      } else {
        if (candidate.querySelector('button, h1, h2, h3, h4')) {
          return;
        }

        const directChildren = Array.from(candidate.children)
          .filter((child) => {
            const tag = child.tagName;

            return !['SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG'].includes(tag);
          })
          .map((child) => getCleanText(child))
          .filter(Boolean);

        if (directChildren.length >= 2 && directChildren.length <= 4) {
          const label = directChildren[0];
          const value = directChildren.slice(1).join(' ');

          cells = [label, value];
        }
      }

      if (cells.length < 2) return;

      const label = cells[0];
      const value = cells.slice(1).join(' ');

      if (!isGoodSpecRow(label, value)) return;

      const key = `${label}___${value}`;

      if (used.has(key)) return;

      used.add(key);
      rows.push([label, value]);
    });

    return rows;
  }

  function buildTable(rows) {
    if (!rows || rows.length === 0) return '';

    let table = '<table class="nst-product-table"><tbody>';

    rows.forEach((row) => {
      const label = row[0] || '';
      const value = row.slice(1).join(' ') || '';

      table += '<tr>';
      table += `<th>${escapeHtml(label)}</th>`;
      table += `<td>${escapeHtml(value)}</td>`;
      table += '</tr>';
    });

    table += '</tbody></table>';

    return table;
  }

  function buildFlexibleTable(rows) {
    if (!rows || rows.length === 0) return '';

    let table = '<table class="nst-product-table"><tbody>';

    rows.forEach((row, rowIndex) => {
      table += '<tr>';

      row.forEach((cell) => {
        if (rowIndex === 0) {
          table += `<th>${escapeHtml(cell)}</th>`;
        } else {
          table += `<td>${escapeHtml(cell)}</td>`;
        }
      });

      table += '</tr>';
    });

    table += '</tbody></table>';

    return table;
  }

  function cleanHtml(html) {
    if (!html) return '';

    const template = document.createElement('template');
    template.innerHTML = html;

    removeDangerousElements(template.content);
    cleanNodeAttributes(template.content);

    Array.from(template.content.querySelectorAll('table')).forEach((table) => {
      table.className = 'nst-product-table';
    });

    Array.from(template.content.querySelectorAll('div')).forEach((div) => {
      const p = document.createElement('p');
      p.innerHTML = div.innerHTML;
      div.replaceWith(p);
    });

    return template.innerHTML
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/<p><br><\/p><p><br><\/p>/gi, '<p><br></p>')
      .trim();
  }

  function cleanNodeAttributes(root) {
    const allowedTags = new Set([
      'P',
      'BR',
      'B',
      'STRONG',
      'I',
      'EM',
      'U',
      'S',
      'H1',
      'H2',
      'H3',
      'H4',
      'UL',
      'OL',
      'LI',
      'TABLE',
      'THEAD',
      'TBODY',
      'TR',
      'TH',
      'TD',
      'A',
    ]);

    const elements = Array.from(root.querySelectorAll('*'));

    elements.forEach((element) => {
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      Array.from(element.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();

        const isTableClass =
          element.tagName === 'TABLE' &&
          name === 'class' &&
          attr.value === 'nst-product-table';

        const isLinkAttr =
          element.tagName === 'A' &&
          ['href', 'target', 'rel'].includes(name);

        const isTableCellAttr =
          ['TD', 'TH'].includes(element.tagName) &&
          ['colspan', 'rowspan'].includes(name);

        if (!isTableClass && !isLinkAttr && !isTableCellAttr) {
          element.removeAttribute(attr.name);
        }
      });

      if (element.tagName === 'A') {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  function removeDangerousElements(root) {
    Array.from(
      root.querySelectorAll('script, style, iframe, object, embed, svg, path, meta, link')
    ).forEach((element) => element.remove());
  }

  function getCleanText(element) {
    if (!element) return '';

    const clone = element.cloneNode(true);

    removeDangerousElements(clone);

    return clone.textContent
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function isGoodHeading(text) {
    if (!text) return false;
    if (text.length > 80) return false;

    const badWords = ['plus', 'minus', 'expand', 'collapse'];

    return !badWords.includes(text.toLowerCase());
  }

  function isGoodSpecRow(label, value) {
    if (!label || !value) return false;
    if (label.length > 120) return false;
    if (value.length > 1200) return false;
    if (label === value) return false;

    const badLabels = ['bodybody', 'commscomms', 'displaydisplay'];

    return !badLabels.includes(label.toLowerCase().replace(/\s+/g, ''));
  }

  function convertPlainTextToParagraphs(text) {
    if (!text) return '';

    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('');
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return (
    <div className="border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-xl overflow-hidden bg-white">
      <style>
        {`
          .nst-editor {
            font-family: inherit;
            color: #312E81;
            background: #ffffff;
          }

          .nst-editor p {
            margin: 8px 0;
            color: #374151;
            font-size: 14px;
            line-height: 1.75;
          }

          .nst-editor h1 {
            font-size: 28px;
            font-weight: 800;
            margin: 18px 0 12px;
            color: var(--nst-dashboard-primary);
          }

          .nst-editor h2 {
            font-size: 22px;
            font-weight: 800;
            margin: 16px 0 10px;
            color: var(--nst-dashboard-primary);
          }

          .nst-editor h3 {
            font-size: 18px;
            font-weight: 800;
            margin: 18px 0 10px;
            color: var(--nst-dashboard-primary);
            border-left: 4px solid var(--nst-dashboard-primary);
            padding-left: 10px;
          }

          .nst-editor h4 {
            font-size: 16px;
            font-weight: 700;
            margin: 14px 0 8px;
            color: var(--nst-dashboard-primary);
          }

          .nst-editor ul {
            list-style: disc;
            padding-left: 24px;
            margin: 10px 0;
          }

          .nst-editor ol {
            list-style: decimal;
            padding-left: 24px;
            margin: 10px 0;
          }

          .nst-editor li {
            margin: 4px 0;
            color: #374151;
            font-size: 14px;
            line-height: 1.7;
          }

          .nst-editor a {
            color: var(--nst-dashboard-primary);
            text-decoration: underline;
            font-weight: 600;
          }

          .nst-editor table,
          .nst-editor .nst-product-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin: 14px 0 22px;
            background: #ffffff;
            border: 1px solid var(--nst-dashboard-border);
            border-radius: 12px;
            overflow: hidden;
            font-family: inherit;
            box-shadow: 0 1px 2px color-mix(in srgb,var(--nst-dashboard-primary) 5%,transparent);
          }

          .nst-editor th,
          .nst-editor td {
            border-bottom: 1px solid var(--nst-dashboard-primary-soft);
            padding: 12px 14px;
            text-align: left;
            vertical-align: top;
            font-size: 14px;
            line-height: 1.65;
            font-family: inherit;
          }

          .nst-editor tr:last-child th,
          .nst-editor tr:last-child td {
            border-bottom: none;
          }

          .nst-editor th {
            width: 34%;
            background: var(--nst-dashboard-primary-soft);
            color: var(--nst-dashboard-primary);
            font-weight: 800;
            border-right: 1px solid var(--nst-dashboard-border);
          }

          .nst-editor td {
            background: #FFFFFF;
            color: #374151;
            font-weight: 500;
          }

          .nst-editor tr:nth-child(even) td {
            background: #FAF7FF;
          }

          .nst-editor tr:nth-child(even) th {
            background: var(--nst-dashboard-primary-soft);
          }

          .nst-editor img,
          .nst-editor video,
          .nst-editor iframe,
          .nst-editor svg {
            display: none !important;
          }
        `}
      </style>

      <div className="flex flex-wrap gap-2 border-b border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-3 bg-[var(--nst-dashboard-primary-soft)]">
        <button
          type="button"
          onClick={() => runCommand('bold')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)] font-bold"
        >
          B
        </button>

        <button
          type="button"
          onClick={() => runCommand('italic')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)] italic"
        >
          I
        </button>

        <button
          type="button"
          onClick={() => runCommand('underline')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)] underline"
        >
          U
        </button>

        <button
          type="button"
          onClick={() => runCommand('strikeThrough')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)] line-through"
        >
          S
        </button>

        <select
          onChange={(e) => runCommand('formatBlock', e.target.value)}
          defaultValue=""
          className="px-3 py-1.5 text-sm rounded border bg-white"
        >
          <option value="">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="p">Normal Text</option>
        </select>

        <button
          type="button"
          onClick={() => runCommand('insertUnorderedList')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          • List
        </button>

        <button
          type="button"
          onClick={() => runCommand('insertOrderedList')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          1. List
        </button>

        <button
          type="button"
          onClick={() => runCommand('justifyLeft')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          Left
        </button>

        <button
          type="button"
          onClick={() => runCommand('justifyCenter')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          Center
        </button>

        <button
          type="button"
          onClick={() => runCommand('justifyRight')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          Right
        </button>

        <button
          type="button"
          onClick={addLink}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          Link
        </button>

        <button
          type="button"
          onClick={insertTable}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
        >
          Insert Table
        </button>

        <button
          type="button"
          onClick={() => runCommand('removeFormat')}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-[var(--nst-dashboard-primary-soft)] text-red-600"
        >
          Clear
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        onInput={updateValue}
        onPaste={handlePaste}
        className="nst-editor min-h-[320px] p-4 focus:outline-none max-w-none"
        style={{ lineHeight: '1.75' }}
      />
    </div>
  );
}