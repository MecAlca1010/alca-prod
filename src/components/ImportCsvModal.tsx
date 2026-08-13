import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV, parseSubRows, parseBomRows, roundQty, type SubImportRow, type CompBomImportRow } from '../lib/csvImport'

interface ImportCsvModalProps {
  onClose: () => void
  onDone: () => void
}

type Mode = 'subs' | 'bom'

/** Normalize part numbers for matching: trim, collapse spaces */
function normPart(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

export default function ImportCsvModal({ onClose, onDone }: ImportCsvModalProps) {
  const [mode, setMode] = useState<Mode>('subs')
  const [fileName, setFileName] = useState('')
  const [subRows, setSubRows] = useState<SubImportRow[]>([])
  const [bomRows, setBomRows] = useState<CompBomImportRow[]>([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState('')

  const onFile = async (file: File | null) => {
    setError('')
    setResult('')
    setSubRows([])
    setBomRows([])
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) {
      setError('Fichier vide ou illisible')
      return
    }
    if (mode === 'subs') {
      const parsed = parseSubRows(rows).map((r) => ({
        part_number: normPart(r.part_number),
        description: r.description.trim(),
      }))
      if (parsed.length === 0) setError('Aucune ligne valide trouvée')
      setSubRows(parsed)
    } else {
      const parsed = parseBomRows(rows).map((r) => ({
        ...r,
        component_part: normPart(r.component_part),
        component_desc: r.component_desc.trim(),
        sub_part: normPart(r.sub_part),
        sub_desc: r.sub_desc.trim(),
      }))
      if (parsed.length === 0) setError('Aucune ligne BOM valide (il faut composant + sous-composant)')
      setBomRows(parsed)
    }
  }

  /** Find existing sub by part_number (exact after normalize). Does NOT update description if exists. */
  async function findSubByPart(part: string): Promise<string | null> {
    const { data } = await supabase
      .from('sub_components')
      .select('id, part_number')
      .eq('part_number', part)
      .maybeSingle()
    return data?.id ?? null
  }

  async function findCompByPart(part: string): Promise<string | null> {
    const { data } = await supabase
      .from('components')
      .select('id')
      .eq('part_number', part)
      .maybeSingle()
    return data?.id ?? null
  }

  const runImport = async () => {
    setImporting(true)
    setError('')
    setResult('')

    try {
      if (mode === 'subs') {
        let created = 0
        let reused = 0
        for (const row of subRows) {
          const existingId = await findSubByPart(row.part_number)
          if (existingId) {
            // Already in DB — reuse, do not create duplicate (description from CSV ignored)
            reused++
            continue
          }
          const { error: err } = await supabase.from('sub_components').insert({
            part_number: row.part_number,
            description: row.description || row.part_number,
          })
          if (err) {
            // Race / unique constraint → treat as existing
            if (err.message.includes('duplicate') || err.code === '23505') {
              reused++
            } else throw err
          } else {
            created++
          }
        }
        setResult(
          `${created} sous-composant(s) créé(s), ${reused} déjà existant(s) réutilisé(s) (match sur n° de pièce).`
        )
      } else {
        const byComp = new Map<string, CompBomImportRow[]>()
        for (const row of bomRows) {
          const key = row.component_part
          if (!byComp.has(key)) byComp.set(key, [])
          byComp.get(key)!.push(row)
        }

        let compsCreated = 0
        let compsExisting = 0
        let subsCreated = 0
        let subsReused = 0
        let linksCreated = 0
        let linksUpdated = 0

        for (const [compPart, lines] of byComp) {
          const desc = lines[0].component_desc

          let compId = await findCompByPart(compPart)
          if (compId) {
            compsExisting++
          } else {
            const { data: created, error: cErr } = await supabase
              .from('components')
              .insert({ part_number: compPart, description: desc || compPart })
              .select('id')
              .single()
            if (cErr) {
              if (cErr.message.includes('duplicate') || cErr.code === '23505') {
                const again = await findCompByPart(compPart)
                if (!again) throw cErr
                compId = again
                compsExisting++
              } else throw cErr
            } else {
              compId = created.id
              compsCreated++
            }
          }

          for (const line of lines) {
            let subId = await findSubByPart(line.sub_part)
            if (subId) {
              subsReused++
            } else {
              const { data: newSub, error: sErr } = await supabase
                .from('sub_components')
                .insert({
                  part_number: line.sub_part,
                  description: line.sub_desc || line.sub_part,
                })
                .select('id')
                .single()
              if (sErr) {
                if (sErr.message.includes('duplicate') || sErr.code === '23505') {
                  const again = await findSubByPart(line.sub_part)
                  if (!again) throw sErr
                  subId = again
                  subsReused++
                } else throw sErr
              } else {
                subId = newSub.id
                subsCreated++
              }
            }

            const { data: existingLink } = await supabase
              .from('component_items')
              .select('id')
              .eq('component_id', compId!)
              .eq('sub_component_id', subId!)
              .maybeSingle()

            const qty = roundQty(line.quantity)
            if (existingLink?.id) {
              await supabase.from('component_items').update({ quantity: qty }).eq('id', existingLink.id)
              linksUpdated++
            } else {
              await supabase.from('component_items').insert({
                component_id: compId!,
                sub_component_id: subId!,
                quantity: qty,
              })
              linksCreated++
            }
          }
        }

        setResult(
          `Composants: ${compsCreated} créés, ${compsExisting} existants. ` +
            `Sous-composants: ${subsCreated} créés, ${subsReused} réutilisés (n° pièce). ` +
            `Liens: ${linksCreated} ajoutés, ${linksUpdated} mis à jour.`
        )
      }
      onDone()
    } catch (e: any) {
      setError(e.message || 'Erreur import')
    }
    setImporting(false)
  }

  const previewCount = mode === 'subs' ? subRows.length : bomRows.length
  const preview = mode === 'subs' ? subRows.slice(0, 8) : bomRows.slice(0, 8)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-black">Import CSV</h2>
          <button onClick={onClose} className="text-2xl text-gray-400 leading-none">×</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('subs')
                setSubRows([])
                setBomRows([])
                setFileName('')
                setResult('')
                setError('')
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'subs' ? 'bg-alca-yellow font-black border-alca-yellow' : 'hover:bg-gray-50'}`}
            >
              Sous-composants
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('bom')
                setSubRows([])
                setBomRows([])
                setFileName('')
                setResult('')
                setError('')
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === 'bom' ? 'bg-alca-yellow font-black border-alca-yellow' : 'hover:bg-gray-50'}`}
            >
              Composants + nomenclature
            </button>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
            {mode === 'subs' ? (
              <>
                <p className="font-medium text-gray-700">Format attendu (CSV, séparateur , ou ;)</p>
                <p>Colonnes : <code>numero_piece, description</code></p>
                <p>Si le n° de pièce existe déjà → réutilisé (pas de doublon). La description du CSV n’écrase pas l’existante.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-gray-700">Format attendu (CSV)</p>
                <p>Colonnes : <code>composant_part, composant_desc, sous_part, sous_desc, quantite</code></p>
                <p>Match strict sur le n° de pièce. Sous-composants existants réutilisés. Quantités arrondies à 2 décimales.</p>
              </>
            )}
            <p className="mt-1">Dans Excel : Fichier → Enregistrer sous → CSV UTF-8.</p>
          </div>

          <div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            {fileName && <p className="text-xs text-gray-500 mt-1">{fileName}</p>}
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
          {result && <div className="text-green-700 text-sm bg-green-50 p-2 rounded">{result}</div>}

          {previewCount > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{previewCount} ligne(s) détectée(s) — aperçu :</p>
              <div className="border rounded-lg overflow-x-auto max-h-48 text-xs">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    {mode === 'subs' ? (
                      <tr>
                        <th className="text-left p-2">N° pièce</th>
                        <th className="text-left p-2">Description</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="text-left p-2">Composant</th>
                        <th className="text-left p-2">Sous-composant</th>
                        <th className="text-right p-2">Qté</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {mode === 'subs'
                      ? (preview as SubImportRow[]).map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 font-medium">{r.part_number}</td>
                            <td className="p-2">{r.description}</td>
                          </tr>
                        ))
                      : (preview as CompBomImportRow[]).map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{r.component_part}</td>
                            <td className="p-2">{r.sub_part}</td>
                            <td className="p-2 text-right">{r.quantity}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
              {previewCount > 8 && (
                <p className="text-[11px] text-gray-400 mt-1">… et {previewCount - 8} autres</p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 border py-2.5 rounded-lg text-sm">
            Fermer
          </button>
          <button
            onClick={runImport}
            disabled={importing || previewCount === 0}
            className="flex-1 bg-alca-yellow font-black py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {importing ? 'Import…' : `Importer ${previewCount || ''} ligne(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
