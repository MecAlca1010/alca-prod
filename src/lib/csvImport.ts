/** Simple CSV parser (handles quoted fields) */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const normalized = text.replace(/^\uFEFF/, '') // strip BOM

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    const next = normalized[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',' || ch === ';') {
        row.push(cell.trim())
        cell = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(cell.trim())
        cell = ''
        if (row.some((c) => c.length > 0)) rows.push(row)
        row = []
        if (ch === '\r') i++
      } else if (ch === '\r') {
        row.push(cell.trim())
        cell = ''
        if (row.some((c) => c.length > 0)) rows.push(row)
        row = []
      } else {
        cell += ch
      }
    }
  }
  row.push(cell.trim())
  if (row.some((c) => c.length > 0)) rows.push(row)
  return rows
}

export function roundQty(n: number): number {
  return Math.round(n * 100) / 100
}

export interface SubImportRow {
  part_number: string
  description: string
}

export interface CompBomImportRow {
  component_part: string
  component_desc: string
  sub_part: string
  sub_desc: string
  quantity: number
}

/** Detect header and map sub-component rows */
export function parseSubRows(rows: string[][]): SubImportRow[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
  const isHeader =
    header.some((h) => h.includes('piece') || h.includes('part') || h.includes('numero') || h.includes('n°') || h.includes('no')) ||
    header.some((h) => h.includes('desc'))

  const data = isHeader ? rows.slice(1) : rows
  const partIdx = isHeader
    ? Math.max(
        0,
        header.findIndex((h) => h.includes('piece') || h.includes('part') || h.includes('numero') || h.includes('n°') || h.includes('no') || h === 'sku')
      )
    : 0
  const descIdx = isHeader
    ? Math.max(
        1,
        header.findIndex((h) => h.includes('desc') || h.includes('libelle') || h.includes('name') || h.includes('nom'))
      )
    : 1

  const result: SubImportRow[] = []
  for (const r of data) {
    const part = (r[partIdx] || '').trim()
    const desc = (r[descIdx] || r[1] || '').trim()
    if (!part) continue
    result.push({ part_number: part, description: desc || part })
  }
  return result
}

/** BOM-style: component + sub lines */
export function parseBomRows(rows: string[][]): CompBomImportRow[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
  const isHeader = header.some((h) => h.includes('composant') || h.includes('component') || h.includes('sub') || h.includes('qte') || h.includes('qty'))

  const data = isHeader ? rows.slice(1) : rows

  const find = (preds: string[], fallback: number) => {
    const i = header.findIndex((h) => preds.some((p) => h.includes(p)))
    return i >= 0 ? i : fallback
  }

  const cPart = isHeader ? find(['composant_part', 'comp_part', 'component_part', 'composant'], 0) : 0
  const cDesc = isHeader ? find(['composant_desc', 'comp_desc', 'component_desc', 'comp_description'], 1) : 1
  const sPart = isHeader ? find(['sous_part', 'sub_part', 'sous-composant', 'sub_component'], 2) : 2
  const sDesc = isHeader ? find(['sous_desc', 'sub_desc', 'sous_description'], 3) : 3
  const qtyI = isHeader ? find(['qte', 'qty', 'quantity', 'quantite'], 4) : 4

  const result: CompBomImportRow[] = []
  for (const r of data) {
    const component_part = (r[cPart] || '').trim()
    const sub_part = (r[sPart] || '').trim()
    if (!component_part || !sub_part) continue
    let quantity = parseFloat((r[qtyI] || '1').replace(',', '.'))
    if (isNaN(quantity) || quantity <= 0) quantity = 1
    quantity = roundQty(Math.round(quantity * 10000) / 10000) // input up to 4 decimals conceptually, store 2
    result.push({
      component_part,
      component_desc: (r[cDesc] || '').trim() || component_part,
      sub_part,
      sub_desc: (r[sDesc] || '').trim() || sub_part,
      quantity,
    })
  }
  return result
}
