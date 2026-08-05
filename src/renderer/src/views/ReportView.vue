<template>
  <div class="report">
    <div class="toolbar">
      <div class="title">
        <h2>报表中心</h2>
        <span class="muted">看看你的时间都去哪了</span>
      </div>
      <div class="scope">
        <button class="btn" :class="{ primary: scope === 'day' }" @click="setScope('day')">日</button>
        <button class="btn" :class="{ primary: scope === 'week' }" @click="setScope('week')">周</button>
        <button class="btn" :class="{ primary: scope === 'month' }" @click="setScope('month')">月</button>
      </div>
    </div>

    <div class="metrics">
      <div class="stat"><span class="v num">{{ effectiveText }}</span><span class="l">有效工时</span></div>
      <div class="stat"><span class="v num">{{ totalText }}</span><span class="l">总时长</span></div>
      <div class="stat"><span class="v num">{{ fragmentCount }}</span><span class="l">碎片段</span></div>
      <div class="stat"><span class="v num">{{ entryCount }}</span><span class="l">记录段数</span></div>
    </div>

    <div class="charts">
      <div class="card chart-box">
        <h3>标签分布</h3>
        <div ref="pieEl" class="chart"></div>
      </div>
      <div class="card chart-box">
        <h3>标签耗时对比</h3>
        <div ref="barEl" class="chart"></div>
      </div>
    </div>

    <div class="card chart-box">
      <h3>近期每日有效工时趋势</h3>
      <div ref="lineEl" class="chart tall"></div>
    </div>

    <div class="report-actions">
      <button class="btn" disabled title="P2 实现">生成日报（P2）</button>
      <span class="muted">模型报告将在 P2 开放</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import * as echarts from 'echarts'
import { api } from '../api'
import { formatDuration } from '../utils/format'

const DAY_MS = 86400000
const scope = ref('day')
const pieEl = ref(null)
const barEl = ref(null)
const lineEl = ref(null)
const effectiveSec = ref(0)
const totalSec = ref(0)
const fragmentCount = ref(0)
const entryCount = ref(0)
let charts = []

const effectiveText = ref('0s')
const totalText = ref('0s')

function rangeOf(scope) {
  const now = new Date()
  if (scope === 'day') {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return { start: d.getTime(), end: d.getTime() + DAY_MS, month: d.getTime() }
  }
  if (scope === 'week') {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1
    const start = d.getTime() - day * DAY_MS
    return { start, end: start + 7 * DAY_MS, month: d.getTime() }
  }
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return { start: d.getTime(), end: d.getTime() + 31 * DAY_MS, month: d.getTime() }
}

async function load() {
  const { start, end, month } = rangeOf(scope.value)
  const [dist, trend, timeline] = await Promise.all([
    api('report:tagDistribution', { start, end }),
    api('report:dailyTrend', { month }),
    api('report:dailyTimeline', { date: month })
  ])
  const entries = timeline.segments || []
  totalSec.value = entries.reduce((s, e) => s + (e.duration_sec || 0), 0)
  effectiveSec.value = entries.filter((e) => !e.isBreak).reduce((s, e) => s + (e.duration_sec || 0), 0)
  fragmentCount.value = entries.filter((e) => e.is_fragment).length
  entryCount.value = entries.length
  effectiveText.value = formatDuration(effectiveSec.value)
  totalText.value = formatDuration(totalSec.value)

  const pie = echarts.getInstanceByDom(pieEl.value) || echarts.init(pieEl.value)
  pie.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c}s' },
    series: [{
      type: 'pie',
      radius: ['42%', '70%'],
      label: { show: true, formatter: '{b}', color: '#e8e6e1' },
      data: (dist.data || []).map((d) => ({ name: d.name, value: d.totalSec, itemStyle: { color: d.color } }))
    }]
  })

  const bar = echarts.getInstanceByDom(barEl.value) || echarts.init(barEl.value)
  bar.setOption({
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatDuration(v) },
    grid: { left: 40, right: 12, top: 20, bottom: 28 },
    xAxis: { type: 'category', data: (dist.data || []).map((d) => d.name), axisLabel: { color: '#8f8a82' } },
    yAxis: { type: 'value', axisLabel: { color: '#8f8a82' } },
    series: [{
      type: 'bar',
      barWidth: 22,
      data: (dist.data || []).map((d) => ({ value: d.totalSec, itemStyle: { color: d.color } }))
    }]
  })

  const line = echarts.getInstanceByDom(lineEl.value) || echarts.init(lineEl.value)
  const trendData = trend.data || []
  line.setOption({
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatDuration(v) },
    grid: { left: 40, right: 12, top: 20, bottom: 28 },
    xAxis: { type: 'category', data: trendData.map((d) => d.date), axisLabel: { color: '#8f8a82' } },
    yAxis: { type: 'value', axisLabel: { color: '#8f8a82' } },
    series: [
      { name: '有效', type: 'line', smooth: true, data: trendData.map((d) => d.effectiveSec), itemStyle: { color: '#d4af6a' } },
      { name: '总时长', type: 'line', smooth: true, data: trendData.map((d) => d.totalSec), itemStyle: { color: '#8f8a82' } }
    ]
  })

  charts = [pie, bar, line]
}

function setScope(s) {
  scope.value = s
  load()
}

onMounted(() => {
  load()
  window.addEventListener('resize', () => charts.forEach((c) => c.resize()))
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.title h2 { font-size: 18px; font-weight: 500; margin-bottom: 2px; }
.scope { display: flex; gap: 6px; }
.metrics { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; }
.stat .v { font-size: 22px; font-weight: 600; color: var(--gold); }
.stat .l { font-size: 12px; color: var(--text-dim); }
.charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.chart-box h3 { font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--text-dim); }
.chart { height: 240px; }
.chart.tall { height: 260px; }
.report-actions { margin-top: 16px; display: flex; align-items: center; gap: 12px; }
@media (max-width: 720px) { .charts { grid-template-columns: 1fr; } }
</style>
