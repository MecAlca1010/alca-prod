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
      // Only treat " as CSV quote delimiter at the START of a cell.
      // Inch marks in text like 1/4" or 6" must stay as normal characters.
      if (ch === '"' && cell.length === 0) {
        inQuotes = true
      } else if (ch === '"') {
        cell += ch
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

/** BOM-style: component + sub lines
 * Supported headers (flexible), e.g.:
 *   numero_piece, description, sous_composant, quantite
 *   composant_part, composant_desc, sous_part, sous_desc, quantite
 */
export function parseBomRows(rows: string[][]): CompBomImportRow[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) =>
    h.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s_]+/g, '_')
  )

  const isHeader = header.some((h) =>
    /piece|part|numero|composant|component|sous|sub|qte|qty|quantite|description/.test(h)
  )
  const data = isHeader ? rows.slice(1) : rows

  // Prefer specific matches; avoid matching "sous_composant" as the main component column
  const findCol = (preds: RegExp[], fallback: number) => {
    if (!isHeader) return fallback
    for (const re of preds) {
      const i = header.findIndex((h) => re.test(h))
      if (i >= 0) return i
    }
    return fallback
  }

  const cPart = findCol(
    [
      /^(composant_part|comp_part|component_part|component|composant)$/,
      /numero_piece|n[_]?piece|part_number|sku|^numero$|^piece$/,
      /^composant(?!.*sous)/, // "composant" but not "sous_composant"
    ],
    0
  )
  const cDesc = findCol(
    [/composant_desc|comp_desc|component_desc|comp_description/, /^description$/, /^desc$/],
    cPart === 0 ? 1 : Math.min(1, header.length - 1)
  )
  const sPart = findCol(
    [
      /sous_composant|sous-composant|sous_part|sub_part|sub_component|sous_piece/,
      /^sous$|^sub$/,
    ],
    2
  )
  const sDesc = findCol([/sous_desc|sub_desc|sous_description|sub_description/], -1)
  const qtyI = findCol([/quantite|quantity|^qte$|^qty$/], header.length >= 5 ? 4 : 3)

  const result: CompBomImportRow[] = []
  for (const r of data) {
    const component_part = (r[cPart] || '').trim()
    const sub_part = (r[sPart] || '').trim()
    if (!component_part || !sub_part) continue
    // Guard: if detection swapped columns, skip nonsense
    if (component_part === sub_part) continue

    let quantity = parseFloat(String(r[qtyI] ?? '1').replace(',', '.'))
    if (isNaN(quantity) || quantity <= 0) quantity = 1
    quantity = roundQty(Math.round(quantity * 10000) / 10000)

    const sub_desc =
      sDesc >= 0 ? (r[sDesc] || '').trim() || sub_part : sub_part

    result.push({
      component_part,
      component_desc: (r[cDesc] || '').trim() || component_part,
      sub_part,
      sub_desc,
      quantity,
    })
  }
  return result
}
