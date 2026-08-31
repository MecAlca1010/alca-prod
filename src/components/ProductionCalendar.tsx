import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import {
  startOfWeek,
  getWeekDays,
  formatDayLabel,
  formatWeekRange,
  formatDate,
  parseDate,
  addBusinessDays,
  countBusinessDays,
  snapToBusinessDay,
  nextBusinessDay,
  isBusinessDay,
} from '../lib/dates'
import type { ScheduledStage } from '../lib/scheduler'
import { checkManualChange } from '../lib/constraints'
import ConfirmModal from './ConfirmModal'

export interface ResourceBlockBar {
  start_date: string
  end_date: string
  reason?: string | null
}

interface ProductionCalendarProps {
  scheduledStages: ScheduledStage[]
  isAdmin: boolean
  onReoptimize?: () => void
  isOptimizing?: boolean
  onStageDatesChange?: (stage: ScheduledStage) => Promise<void>
  resourceBlocks?: ResourceBlockBar[]
}

type DragMode = 'move' | 'resize-left' | 'resize-right' | null

export default function ProductionCalendar({
  scheduledStages,
  isAdmin,
  onReoptimize,
  isOptimizing,
  onStageDatesChange,
  resourceBlocks = [],
}: ProductionCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [localStages, setLocalStages] = useState<ScheduledStage[]>(scheduledStages)

  // Sync from parent when schedule changes
  useEffect(() => {
    setLocalStages(scheduledStages)
  }, [scheduledStages])

  // Drag state
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [dragStageId, setDragStageId] = useState<string | null>(null)
  const dragOrigin = useRef<{ x: number; startDate: string; endDate: string } | null>(null)
  const dayWidthRef = useRef(80) // approximate, updated on layout

  // Confirm for rule violations
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingStage, setPendingStage] = useState<ScheduledStage | null>(null)
  const [violations, setViolations] = useState<string[]>([])
  const originalStage = useRef<ScheduledStage | null>(null)
  const stagesBeforeEdit = useRef<ScheduledStage[] | null>(null)

  const baseWeekStart = useMemo(() => startOfWeek(new Date()), [])

  const weeksToShow = useMemo(() => {
    if (!expanded) return 4
    if (localStages.length === 0) return 8
    let maxEnd = localStages[0].endDate
    for (const s of localStages) {
      if (s.endDate > maxEnd) maxEnd = s.endDate
    }
    const lastWeekStart = startOfWeek(parseDate(maxEnd))
    const firstVisible = new Date(baseWeekStart)
    firstVisible.setDate(baseWeekStart.getDate() + weekOffset * 7)
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const diffMs = lastWeekStart.getTime() - firstVisible.getTime()
    return Math.min(Math.max(4, Math.ceil(diffMs / msPerWeek) + 1), 52)
  }, [expanded, localStages, baseWeekStart, weekOffset])

  const weeks = useMemo(() => {
    const result: { start: Date; days: Date[] }[] = []
    for (let w = 0; w < weeksToShow; w++) {
      const start = new Date(baseWeekStart)
      start.setDate(baseWeekStart.getDate() + (weekOffset + w) * 7)
      result.push({ start, days: getWeekDays(start) })
    }
    return result
  }, [baseWeekStart, weekOffset, weeksToShow])

  const visibleStart = weeks[0]?.days[0]
  const visibleEnd = weeks[weeks.length - 1]?.days[4]

  const barsInView = useMemo(() => {
    if (!visibleStart || !visibleEnd) return []
    const vStart = formatDate(visibleStart)
    const vEnd = formatDate(visibleEnd)
    return localStages.filter((s) => s.startDate <= vEnd && s.endDate >= vStart)
  }, [localStages, visibleStart, visibleEnd])

  function getBarStyle(stage: ScheduledStage, weekDays: Date[]) {
    const weekStartStr = formatDate(weekDays[0])
    const weekEndStr = formatDate(weekDays[4])
    const barStart = stage.startDate < weekStartStr ? weekStartStr : stage.startDate
    const barEnd = stage.endDate > weekEndStr ? weekEndStr : stage.endDate
    const startIdx = weekDays.findIndex((d) => formatDate(d) === barStart)
    const endIdx = weekDays.findIndex((d) => formatDate(d) === barEnd)
    if (startIdx === -1 || endIdx === -1) return null
    return {
      left: `${(startIdx / 5) * 100}%`,
      width: `${((endIdx - startIdx + 1) / 5) * 100}%`,
    }
  }

  function assignLanes(stages: ScheduledStage[], weekDays: Date[]): Map<string, number> {
    const lanes = new Map<string, number>()
    const laneEnds: string[] = []
    const sorted = [...stages].sort((a, b) => a.startDate.localeCompare(b.startDate))
    for (const s of sorted) {
      if (!getBarStyle(s, weekDays)) continue
      let lane = 0
      while (lane < laneEnds.length && laneEnds[lane] >= s.startDate) lane++
      lanes.set(s.projectStageId + weekDays[0].toISOString(), lane)
      laneEnds[lane] = s.endDate
    }
    return lanes
  }

  const applyStageUpdate = useCallback(
    (updated: ScheduledStage, allStages: ScheduledStage[]) => {
      const all = allStages.map((s) =>
        s.projectStageId === updated.projectStageId ? updated : s
      )
      const issues = checkManualChange(updated, all)
      if (issues.length > 0) {
        setPendingStage(updated)
        setViolations(issues.map((i) => i.message))
        setConfirmOpen(true)
        // keep visual at updated position until user confirms/cancels
        setLocalStages(all)
      } else {
        setLocalStages(all)
        onStageDatesChange?.(updated)
      }
    },
    [onStageDatesChange]
  )

  const handleConfirmOverride = async () => {
    if (!pendingStage) return
    setConfirmOpen(false)
    setLocalStages((prev) =>
      prev.map((s) => (s.projectStageId === pendingStage.projectStageId ? pendingStage : s))
    )
    await onStageDatesChange?.(pendingStage)
    setPendingStage(null)
    originalStage.current = null
    stagesBeforeEdit.current = null
    setViolations([])
  }

  const handleCancelOverride = () => {
    try {
      setConfirmOpen(false)
      setPendingStage(null)
      setViolations([])
      // Restore full snapshot from before the drag (avoids blank screen / stale state)
      if (stagesBeforeEdit.current && stagesBeforeEdit.current.length > 0) {
        setLocalStages(stagesBeforeEdit.current.map((s) => ({ ...s })))
      } else if (originalStage.current) {
        const orig = originalStage.current
        setLocalStages((prev) =>
          prev.map((s) => (s.projectStageId === orig.projectStageId ? { ...orig } : s))
        )
      } else {
        setLocalStages(scheduledStages.map((s) => ({ ...s })))
      }
    } catch (e) {
      console.error('Cancel override failed', e)
      setLocalStages(scheduledStages.map((s) => ({ ...s })))
      setConfirmOpen(false)
    } finally {
      originalStage.current = null
      stagesBeforeEdit.current = null
    }
  }

  // --- Pointer handlers for drag/resize ---
  const onPointerDown = (
    e: React.PointerEvent,
    stage: ScheduledStage,
    mode: DragMode
  ) => {
    if (!isAdmin || !mode) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragMode(mode)
    setDragStageId(stage.projectStageId)
    originalStage.current = { ...stage }
    stagesBeforeEdit.current = localStages.map((s) => ({ ...s }))
    dragOrigin.current = {
      x: e.clientX,
      startDate: stage.startDate,
      endDate: stage.endDate,
    }
  }

  useEffect(() => {
    if (!dragMode || !dragStageId) return

    const onMove = (e: PointerEvent) => {
      if (!dragOrigin.current) return
      const dx = e.clientX - dragOrigin.current.x
      // ~ one day column ≈ measured; fallback 70px
      const dayPx = dayWidthRef.current || 70
      const dayDelta = Math.round(dx / dayPx)

      setLocalStages((prev) =>
        prev.map((s) => {
          if (s.projectStageId !== dragStageId) return s

          let newStart = parseDate(dragOrigin.current!.startDate)
          let newEnd = parseDate(dragOrigin.current!.endDate)

          if (dragMode === 'move') {
            if (dayDelta > 0) {
              newStart = addBusinessDays(newStart, dayDelta)
              newEnd = addBusinessDays(newEnd, dayDelta)
            } else if (dayDelta < 0) {
              // move backward
              for (let i = 0; i < -dayDelta; i++) {
                newStart.setDate(newStart.getDate() - 1)
                while (!isBusinessDay(newStart)) newStart.setDate(newStart.getDate() - 1)
                newEnd.setDate(newEnd.getDate() - 1)
                while (!isBusinessDay(newEnd)) newEnd.setDate(newEnd.getDate() - 1)
              }
            }
          } else if (dragMode === 'resize-right') {
            if (dayDelta > 0) {
              newEnd = addBusinessDays(parseDate(dragOrigin.current!.endDate), dayDelta)
            } else if (dayDelta < 0) {
              newEnd = parseDate(dragOrigin.current!.endDate)
              for (let i = 0; i < -dayDelta; i++) {
                newEnd.setDate(newEnd.getDate() - 1)
                while (!isBusinessDay(newEnd)) newEnd.setDate(newEnd.getDate() - 1)
              }
              // min 1 day
              if (newEnd < newStart) newEnd = new Date(newStart)
            }
          } else if (dragMode === 'resize-left') {
            if (dayDelta > 0) {
              newStart = addBusinessDays(parseDate(dragOrigin.current!.startDate), dayDelta)
              if (newStart > newEnd) newStart = new Date(newEnd)
            } else if (dayDelta < 0) {
              newStart = parseDate(dragOrigin.current!.startDate)
              for (let i = 0; i < -dayDelta; i++) {
                newStart.setDate(newStart.getDate() - 1)
                while (!isBusinessDay(newStart)) newStart.setDate(newStart.getDate() - 1)
              }
            }
          }

          newStart = snapToBusinessDay(newStart)
          newEnd = snapToBusinessDay(newEnd)
          if (newEnd < newStart) newEnd = new Date(newStart)

          const duration = countBusinessDays(newStart, newEnd)

          return {
            ...s,
            startDate: formatDate(newStart),
            endDate: formatDate(newEnd),
            durationDays: duration,
          }
        })
      )
    }

    const onUp = () => {
      const stage = localStages.find((s) => s.projectStageId === dragStageId)
      // Use functional update to get latest
      setLocalStages((current) => {
        const updated = current.find((s) => s.projectStageId === dragStageId)
        if (updated && originalStage.current) {
          const changed =
            updated.startDate !== originalStage.current.startDate ||
            updated.endDate !== originalStage.current.endDate
          if (changed) {
            // Defer validation
            setTimeout(() => applyStageUpdate(updated, current), 0)
          } else {
            originalStage.current = null
          }
        }
        return current
      })
      setDragMode(null)
      setDragStageId(null)
      dragOrigin.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragMode, dragStageId, applyStageUpdate, localStages])

  const expandLabel = expanded
    ? 'Réduire (4 semaines)'
    : localStages.length > 0
      ? 'Agrandir (jusqu’à la fin)'
      : 'Agrandir'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-black">Calendrier de production</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setWeekOffset((o) => o - 1)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">←</button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Aujourd'hui</button>
          <button onClick={() => setWeekOffset((o) => o + 1)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">→</button>
          <button onClick={() => setExpanded((e) => !e)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">{expandLabel}</button>
          {isAdmin && onReoptimize && (
            <button
              onClick={onReoptimize}
              disabled={isOptimizing}
              className="px-3 py-1 bg-alca-yellow text-alca-black font-black rounded text-sm hover:brightness-110 disabled:opacity-50"
            >
              {isOptimizing ? 'Optimisation...' : 'Réoptimiser'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <p className="text-xs text-gray-400 mb-3">
          Mode admin : glisse le milieu d’une barre pour la déplacer, les bords pour changer la durée.
          Si une règle est cassée, une confirmation s’affiche.
        </p>
      )}

      {resourceBlocks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {resourceBlocks.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-red-50 text-red-800 border border-red-200 px-2 py-1 rounded"
            >
              <span className="w-2 h-2 rounded-sm bg-red-400" />
              Porte 8 bloquée {b.start_date} → {b.end_date}
              {b.reason ? ` — ${b.reason}` : ''}
            </span>
          ))}
        </div>
      )}

      {expanded && localStages.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          Vue étendue : {weeksToShow} semaines. Faites défiler pour voir plus loin.
        </p>
      )}

      <div
        className={`space-y-6 ${expanded ? 'max-h-[70vh] overflow-y-auto pr-1' : ''}`}
        ref={(el) => {
          if (el) {
            const w = el.getBoundingClientRect().width
            dayWidthRef.current = Math.max(40, w / 5)
          }
        }}
      >
        {weeks.map((week) => {
          const weekStages = barsInView.filter((s) => {
            const ws = formatDate(week.days[0])
            const we = formatDate(week.days[4])
            return s.startDate <= we && s.endDate >= ws
          })
          const lanes = assignLanes(weekStages, week.days)
          const maxLane = weekStages.length === 0 ? 0 : Math.max(0, ...Array.from(lanes.values()))
          const laneHeight = 28
          const barsHeight = (maxLane + 1) * (laneHeight + 4) + 8

          return (
            <div key={week.start.toISOString()}>
              <div className="text-xs font-medium text-gray-500 mb-2">{formatWeekRange(week.start)}</div>
              <div className="grid grid-cols-5 gap-px mb-1">
                {week.days.map((day) => {
                  const isToday = formatDate(day) === formatDate(new Date())
                  return (
                    <div
                      key={day.toISOString()}
                      className={`text-center text-xs py-1 rounded ${isToday ? 'bg-alca-yellow/30 font-black' : 'text-gray-500'}`}
                    >
                      {formatDayLabel(day)}
                    </div>
                  )
                })}
              </div>

              <div
                className="relative border border-gray-100 rounded-lg bg-gray-50/50"
                style={{ minHeight: Math.max(barsHeight, 48) }}
              >
                <div className="absolute inset-0 grid grid-cols-5 pointer-events-none">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="border-r border-gray-100 last:border-r-0" />
                  ))}
                </div>

                {weekStages.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">
                    Aucune étape
                  </div>
                )}

                {weekStages.map((stage) => {
                  const style = getBarStyle(stage, week.days)
                  if (!style) return null
                  const lane = lanes.get(stage.projectStageId + week.days[0].toISOString()) || 0
                  const isDragging = dragStageId === stage.projectStageId

                  return (
                    <div
                      key={stage.projectStageId + week.start.toISOString()}
                      className={`absolute rounded text-xs text-white font-medium shadow-sm select-none ${
                        isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                      } ${isDragging ? 'ring-2 ring-black/30 z-10' : ''}`}
                      style={{
                        left: style.left,
                        width: style.width,
                        top: 4 + lane * (laneHeight + 4),
                        height: laneHeight,
                        backgroundColor: stage.color,
                        opacity: stage.isCompleted ? 0.45 : isDragging ? 0.9 : 1,
                        textDecoration: stage.isCompleted ? 'line-through' : 'none',
                      }}
                      title={`${stage.projectNumber} — ${stage.clientName}\n${stage.stageName}\n${stage.startDate} → ${stage.endDate} (${stage.durationDays} j)`}
                      onPointerDown={(e) => {
                        // Middle = move (not on edges)
                        if (!isAdmin) return
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const relX = e.clientX - rect.left
                        const edge = 8
                        if (relX < edge) onPointerDown(e, stage, 'resize-left')
                        else if (relX > rect.width - edge) onPointerDown(e, stage, 'resize-right')
                        else onPointerDown(e, stage, 'move')
                      }}
                    >
                      {/* Resize handles */}
                      {isAdmin && (
                        <>
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l"
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              onPointerDown(e, stage, 'resize-left')
                            }}
                          />
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              onPointerDown(e, stage, 'resize-right')
                            }}
                          />
                        </>
                      )}
                      <div className="px-1.5 py-0.5 pointer-events-none">
                        <span className="block truncate leading-tight">
                          {stage.projectNumber} {stage.clientName}
                        </span>
                        <span className="block truncate text-[10px] opacity-90 leading-tight">
                          {stage.stageName}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {localStages.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-4">
          Aucun projet planifié. Créez des projets avec des étapes pour voir le calendrier.
        </p>
      )}

      {confirmOpen && (
        <ConfirmModal
          title="Modification hors règles"
          message={
            `Cette modification ne respecte plus certaines règles :\n\n• ${violations.join('\n• ')}\n\nVoulez-vous vraiment conserver ce changement ?`
          }
          confirmLabel="Oui, garder"
          cancelLabel="Non, annuler"
          onConfirm={handleConfirmOverride}
          onCancel={handleCancelOverride}
        />
      )}
    </div>
  )
}
