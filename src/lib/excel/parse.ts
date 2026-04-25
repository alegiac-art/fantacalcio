import * as XLSX from 'xlsx'

/**
 * Rileva il formato reale del file dai magic bytes / contenuto testuale.
 *
 * - 'biff'  → OLE2 (vero XLS binario, magic D0 CF 11 E0)
 * - 'zip'   → ZIP  (XLSX / ODS, magic 50 4B)
 * - 'html'  → file HTML con tabelle (estensione .xls ma contenuto HTML)
 * - 'csv'   → testo plain con separatori
 */
export type ExcelFormat = 'biff' | 'zip' | 'html' | 'csv'

export function detectFormat(buffer: ArrayBuffer): ExcelFormat {
  const bytes = new Uint8Array(buffer.slice(0, 8))

  // OLE2 / BIFF
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
    return 'biff'
  }

  // ZIP (XLSX, ODS, …)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    return 'zip'
  }

  // HTML: legge i primi 512 byte come testo e cerca tag tipici
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(buffer.slice(0, 512))
    .trimStart()
    .toLowerCase()

  if (
    head.startsWith('<html') ||
    head.startsWith('<!doctype') ||
    head.startsWith('<?xml') ||
    head.includes('<table') ||
    head.includes('<thead') ||
    head.includes('<tbody')
  ) {
    return 'html'
  }

  return 'csv'
}

/**
 * Legge un file Excel / HTML / CSV e restituisce un Workbook SheetJS.
 * Usa sempre il parser corretto in base al formato rilevato.
 */
export function parseWorkbook(buffer: ArrayBuffer): { workbook: XLSX.WorkBook; format: ExcelFormat } {
  const format = detectFormat(buffer)

  if (format === 'biff' || format === 'zip') {
    const workbook = XLSX.read(buffer, { type: 'array' })
    return { workbook, format }
  }

  // HTML o CSV: decodifica come testo e usa il parser stringa di SheetJS
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const workbook = XLSX.read(text, { type: 'string' })
  return { workbook, format }
}
