<script setup lang="ts">
import type { Task1Prompt } from './prompts'

const props = defineProps<{ prompt: Task1Prompt }>()

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d6',
]

// ---------- bar ----------
const BAR_W = 560
const BAR_H = 260
const BAR_PAD = { top: 16, right: 16, bottom: 44, left: 44 }
function barGeom() {
  const data = props.prompt.barData || []
  const max = Math.max(...data.map(d => d.value), 1)
  const iw = BAR_W - BAR_PAD.left - BAR_PAD.right
  const ih = BAR_H - BAR_PAD.top - BAR_PAD.bottom
  const slot = iw / data.length
  const bw = Math.min(56, slot * 0.55)
  return data.map((d, i) => {
    const h = (d.value / max) * ih
    return {
      ...d,
      x: BAR_PAD.left + slot * i + (slot - bw) / 2,
      y: BAR_PAD.top + ih - h,
      w: bw,
      h,
      labelX: BAR_PAD.left + slot * i + slot / 2,
      color: COLORS[i % COLORS.length],
    }
  })
}

// ---------- line ----------
const LINE_W = 560
const LINE_H = 260
const LINE_PAD = { top: 16, right: 16, bottom: 36, left: 48 }
function lineGeom() {
  const { lineData = [], series = [] } = props.prompt
  const max = Math.max(...lineData.flatMap(d => d.values), 1)
  const iw = LINE_W - LINE_PAD.left - LINE_PAD.right
  const ih = LINE_H - LINE_PAD.top - LINE_PAD.bottom
  const stepX = lineData.length > 1 ? iw / (lineData.length - 1) : 0
  return series.map((name, si) => ({
    name,
    color: COLORS[si % COLORS.length],
    points: lineData.map((d, i) => ({
      x: LINE_PAD.left + stepX * i,
      y: LINE_PAD.top + ih - (d.values[si] / max) * ih,
      label: d.label,
      value: d.values[si],
    })),
  }))
}
function linePath(points: { x: number; y: number }[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

// ---------- pie ----------
function pieSlices(data: { label: string; value: number }[]) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let acc = 0
  return data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2
    acc += d.value
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2
    const large = end - start > Math.PI ? 1 : 0
    const r = 70
    const cx = 90
    const cy = 90
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    return {
      ...d,
      d: `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`,
      color: COLORS[i % COLORS.length],
    }
  })
}
</script>

<template>
  <div
    class="border border-gray-200 rounded-xl bg-white p-4 dark:border-gray-700"
  >
    <!-- bar -->
    <svg
      v-if="prompt.type === 'bar'"
      :viewBox="`0 0 ${BAR_W} ${BAR_H}`"
      class="w-full"
    >
      <line
        :x1="BAR_PAD.left"
        :y1="BAR_H - BAR_PAD.bottom"
        :x2="BAR_W - BAR_PAD.right"
        :y2="BAR_H - BAR_PAD.bottom"
        stroke="#9ca3af"
      />
      <line
        :x1="BAR_PAD.left"
        :y1="BAR_PAD.top"
        :x2="BAR_PAD.left"
        :y2="BAR_H - BAR_PAD.bottom"
        stroke="#9ca3af"
      />
      <g v-for="b in barGeom()" :key="b.label">
        <rect
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :fill="b.color"
          rx="3"
        />
        <text
          :x="b.x + b.w / 2"
          :y="b.y - 6"
          text-anchor="middle"
          font-size="12"
          fill="#374151"
        >
          {{ b.value }}{{ prompt.unit === '%' ? '%' : '' }}
        </text>
        <text
          :x="b.labelX"
          :y="BAR_H - BAR_PAD.bottom + 18"
          text-anchor="middle"
          font-size="11"
          fill="#6b7280"
        >
          {{ b.label }}
        </text>
      </g>
    </svg>

    <!-- line -->
    <div v-else-if="prompt.type === 'line'">
      <svg :viewBox="`0 0 ${LINE_W} ${LINE_H}`" class="w-full">
        <line
          :x1="LINE_PAD.left"
          :y1="LINE_H - LINE_PAD.bottom"
          :x2="LINE_W - LINE_PAD.right"
          :y2="LINE_H - LINE_PAD.bottom"
          stroke="#9ca3af"
        />
        <line
          :x1="LINE_PAD.left"
          :y1="LINE_PAD.top"
          :x2="LINE_PAD.left"
          :y2="LINE_H - LINE_PAD.bottom"
          stroke="#9ca3af"
        />
        <g v-for="s in lineGeom()" :key="s.name">
          <path
            :d="linePath(s.points)"
            :stroke="s.color"
            stroke-width="2.5"
            fill="none"
          />
          <circle
            v-for="p in s.points"
            :key="p.label + s.name"
            :cx="p.x"
            :cy="p.y"
            r="3.5"
            :fill="s.color"
          />
        </g>
        <g v-for="(d, i) in prompt.lineData || []" :key="d.label">
          <text
            :x="
              LINE_PAD.left
                + ((LINE_W - LINE_PAD.left - LINE_PAD.right)
                  / Math.max((prompt.lineData || []).length - 1, 1))
                * i
            "
            :y="LINE_H - 12"
            text-anchor="middle"
            font-size="11"
            fill="#6b7280"
          >
            {{ d.label }}
          </text>
        </g>
      </svg>
      <div class="mt-2 flex flex-wrap gap-4">
        <span
          v-for="s in lineGeom()"
          :key="s.name"
          class="flex items-center gap-1.5 text-xs text-gray-600"
        >
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            :style="{ background: s.color }"
          />{{ s.name }}<span class="text-gray-400">({{ prompt.unit }})</span>
        </span>
      </div>
    </div>

    <!-- pie -->
    <div
      v-else-if="prompt.type === 'pie'"
      class="flex flex-wrap justify-around gap-4"
    >
      <div
        v-for="pie in prompt.pies || []"
        :key="pie.title"
        class="text-center"
      >
        <div class="mb-1 text-sm font-bold text-gray-700">
          {{ pie.title }}
        </div>
        <svg viewBox="0 0 180 180" class="mx-auto w-44">
          <path
            v-for="s in pieSlices(pie.data)"
            :key="s.label"
            :d="s.d"
            :fill="s.color"
            stroke="#fff"
            stroke-width="1.5"
          />
        </svg>
        <div class="grid grid-cols-1 mt-2 gap-1 text-left">
          <span
            v-for="s in pieSlices(pie.data)"
            :key="s.label"
            class="flex items-center gap-1.5 text-xs text-gray-600"
          >
            <span
              class="inline-block h-2.5 w-2.5 rounded-sm"
              :style="{ background: s.color }"
            />{{ s.label }} {{ s.value }}%
          </span>
        </div>
      </div>
    </div>

    <!-- table -->
    <div v-else-if="prompt.type === 'table'" class="overflow-x-auto rounded-lg">
      <table class="min-w-[560px] w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200">
            <th
              v-for="h in prompt.tableHead || []"
              :key="h"
              class="px-3 py-2 text-left font-bold text-gray-700"
            >
              {{ h }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in prompt.tableRows || []"
            :key="i"
            class="border-b border-gray-100 last:border-0"
          >
            <td
              v-for="(cell, j) in row"
              :key="j"
              class="px-3 py-2 text-gray-600"
              :class="{ 'font-medium text-gray-800': j === 0 }"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- process -->
    <ol v-else-if="prompt.type === 'process'" class="space-y-2">
      <li
        v-for="(step, i) in prompt.steps || []"
        :key="i"
        class="flex gap-3 text-sm text-gray-700"
      >
        <span
          class="h-6 w-6 flex shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
        >{{ i + 1 }}</span>
        <span class="pt-0.5">{{ step }}</span>
      </li>
    </ol>

    <!-- map -->
    <p
      v-else-if="prompt.type === 'map'"
      class="text-sm leading-7 text-gray-700"
    >
      {{ prompt.description }}
    </p>
  </div>
</template>
