const encoder = new window.TextEncoder();

function le16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function le32(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

async function toBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer());
  return encoder.encode(String(content ?? ''));
}

export async function sha256Hex(content) {
  const bytes = await toBytes(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const entries = [];

  for (const file of files) {
    const nameBytes = encoder.encode(String(file.name).replace(/^\/+/, '').replace(/\\/g, '/'));
    const data = await toBytes(file.content);
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(file.date || new Date());
    const flags = 0x0800;

    const localHeader = concatBytes([
      le32(0x04034b50),
      le16(20),
      le16(flags),
      le16(0),
      le16(dosTime),
      le16(dosDate),
      le32(crc),
      le32(data.length),
      le32(data.length),
      le16(nameBytes.length),
      le16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, data);
    entries.push({ nameBytes, data, crc, dosTime, dosDate, offset });
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  entries.forEach((entry) => {
    const centralHeader = concatBytes([
      le32(0x02014b50),
      le16(20),
      le16(20),
      le16(0x0800),
      le16(0),
      le16(entry.dosTime),
      le16(entry.dosDate),
      le32(entry.crc),
      le32(entry.data.length),
      le32(entry.data.length),
      le16(entry.nameBytes.length),
      le16(0),
      le16(0),
      le16(0),
      le16(0),
      le32(0),
      le32(entry.offset),
      entry.nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += centralHeader.length;
  });

  const centralSize = offset - centralOffset;
  const endRecord = concatBytes([
    le32(0x06054b50),
    le16(0),
    le16(0),
    le16(entries.length),
    le16(entries.length),
    le32(centralSize),
    le32(centralOffset),
    le16(0),
  ]);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
