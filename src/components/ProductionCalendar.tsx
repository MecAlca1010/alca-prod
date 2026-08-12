import { useMemo, useState } from 'react'
import {
  startOfWeek,
  getWeekDays,
  formatDayLabel,
  formatWeekRange,
  formatDate,
  parseDate,
} from '../lib/dates'
import type { ScheduledStage } from '../lib/scheduler'

interface ProductionCalendarProps {
  scheduledStages: ScheduledStage[]
  isAdmin: boolean
  onReoptimize?: () => void
  isOptimizing?: boolean
}

export default function ProductionCalendar({
  scheduledStages,
  isAdmin,
  onReoptimize,
  isOptimizing,
}: ProductionCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week
  const [expanded, setExpanded] = useState(false)

  const baseWeekStart = useMemo(() => startOfWeek(new Date()), [])

  // When expanded: show enough weeks to cover the last scheduled stage
  // When collapsed: always 4 weeks
  const weeksToShow = useMemo(() => {
    if (!expanded) return 4

    if (scheduledStages.length === 0) return 8 // fallback

    // Find the latest end date among all stages
    let maxEnd = scheduledStages[0].endDate
    for (const s of scheduledStages) {
      if (s.endDate > maxEnd) maxEnd = s.endDate
    }

    const lastDate = parseDate(maxEnd)
    const lastWeekStart = startOfWeek(lastDate)

    // Number of weeks from baseWeekStart + weekOffset to lastWeekStart, inclusive
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const firstVisible = new Date(baseWeekStart)
    firstVisible.setDate(baseWeekStart.getDate() + weekOffset * 7)

    const diffMs = lastWeekStart.getTime() - firstVisible.getTime()
    const weeksNeeded = Math.max(4, Math.ceil(diffMs / msPerWeek) + 1)

    // Cap at something reasonable (e.g. 52 weeks ≈ 1 year)
    return Math.min(weeksNeeded, 52)
  }, [expanded, scheduledStages, baseWeekStart, weekOffset])

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

    return scheduledStages.filter((s) => {
      return s.startDate <= vEnd && s.endDate >= vStart
    })
  }, [scheduledStages, visibleStart, visibleEnd])

  function getBarStyle(stage: ScheduledStage, weekDays: Date[]) {
    const weekStartStr = formatDate(weekDays[0])
    const weekEndStr = formatDate(weekDays[4])

    const barStart = stage.startDate < weekStartStr ? weekStartStr : stage.startDate
    const barEnd = stage.endDate > weekEndStr ? weekEndStr : stage.endDate

    const startIdx = weekDays.findIndex((d) => formatDate(d) === barStart)
    const endIdx = weekDays.findIndex((d) => formatDate(d) === barEnd)

    if (startIdx === -1 || endIdx === -1) return null

    const leftPercent = (startIdx / 5) * 100
    const widthPercent = ((endIdx - startIdx + 1) / 5) * 100

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    }
  }

  function assignLanes(stages: ScheduledStage[], weekDays: Date[]): Map<string, number> {
    const lanes = new Map<string, number>()
    const laneEnds: string[] = []

    const sorted = [...stages].sort((a, b) => a.startDate.localeCompare(b.startDate))

    for (const s of sorted) {
      const style = getBarStyle(s, weekDays)
      if (!style) continue

      let lane = 0
      while (lane < laneEnds.length && laneEnds[lane] >= s.startDate) {
        lane++
      }
      lanes.set(s.projectStageId + weekDays[0].toISOString(), lane)
      laneEnds[lane] = s.endDate
    }
    return lanes
  }

  // Label for expand button
  const expandLabel = expanded
    ? 'Réduire (4 semaines)'
    : scheduledStages.length > 0
      ? 'Agrandir (jusqu’à la fin)'
      : 'Agrandir'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-black">Calendrier de production</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            title="Semaine précédente"
          >
            ←
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            title="Cette semaine"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            title="Semaine suivante"
          >
            →
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
          >
            {expandLabel}
          </button>
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

      {expanded && scheduledStages.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          Vue étendue : {weeksToShow} semaines (jusqu’à la fin du dernier projet planifié). Faites défiler pour voir plus loin.
        </p>
      )}

      {/* Weeks */}
      <div className={`space-y-6 ${expanded ? 'max-h-[70vh] overflow-y-auto pr-1' : ''}`}>
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
              <div className="text-xs font-medium text-gray-500 mb-2">
                {formatWeekRange(week.start)}
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-5 gap-px mb-1">
                {week.days.map((day) => {
                  const isToday = formatDate(day) === formatDate(new Date())
                  return (
                    <div
                      key={day.toISOString()}
                      className={`text-center text-xs py-1 rounded ${
                        isToday ? 'bg-alca-yellow/30 font-black' : 'text-gray-500'
                      }`}
                    >
                      {formatDayLabel(day)}
                    </div>
                  )
                })}
              </div>

              {/* Bars area */}
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

                  return (
                    <div
                      key={stage.projectStageId + week.start.toISOString()}
                      className="absolute rounded px-1.5 py-0.5 text-xs text-white font-medium truncate shadow-sm cursor-default"
                      style={{
                        left: style.left,
                        width: style.width,
                        top: 4 + lane * (laneHeight + 4),
                        height: laneHeight,
                        backgroundColor: stage.color,
                        opacity: stage.isCompleted ? 0.45 : 1,
                        textDecoration: stage.isCompleted ? 'line-through' : 'none',
                      }}
                      title={`${stage.projectNumber} — ${stage.clientName}\n${stage.stageName}\n${stage.startDate} → ${stage.endDate}`}
                    >
                      <span className="block truncate leading-tight">
                        {stage.projectNumber} {stage.clientName}
                      </span>
                      <span className="block truncate text-[10px] opacity-90 leading-tight">
                        {stage.stageName}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {scheduledStages.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-4">
          Aucun projet planifié. Créez des projets avec des étapes pour voir le calendrier.
        </p>
      )}
    </div>
  )
}
