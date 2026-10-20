<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { modes, scale } from './data'

const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const mode = ref('wave')
const playing = ref(false)
const status = ref('等待你的声音')
const currentMode = computed(() => modes.find((m) => m.id === mode.value) || modes[0])

let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let master: GainNode | null = null
let osc: OscillatorNode | null = null
let oscGain: GainNode | null = null
let seqTimer: number | undefined
let audioEl: HTMLAudioElement | null = null
let mediaSource: MediaElementAudioSourceNode | null = null

const fdata = new Uint8Array(256)
const tdata = new Uint8Array(1024)

function ensureAudio() {
  if (audioCtx) return
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext
  audioCtx = new AC()
  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.8
  master = audioCtx.createGain()
  master.gain.value = 0.9
  analyser.connect(master)
  master.connect(audioCtx.destination)
}

function playDemo() {
  ensureAudio()
  if (!audioCtx || !analyser || !master) return
  stopAllSources()
  osc = audioCtx.createOscillator()
  osc.type = 'sawtooth'
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1800
  oscGain = audioCtx.createGain()
  oscGain.gain.value = 0.16
  osc.connect(filter)
  filter.connect(oscGain)
  oscGain.connect(analyser)
  osc.start()
  let step = 0
  seqTimer = window.setInterval(() => {
    const f = scale[Math.floor(Math.random() * scale.length)]
    osc!.frequency.setTargetAtTime(f, audioCtx!.currentTime, 0.02)
    oscGain!.gain.setTargetAtTime(0.22, audioCtx!.currentTime, 0.01)
    setTimeout(() => oscGain && oscGain.gain.setTargetAtTime(0.08, audioCtx!.currentTime, 0.08), 90)
    step++
  }, 210)
  playing.value = true
  status.value = '正在播放 · 内置合成演示'
}

function stopAllSources() {
  if (seqTimer) window.clearInterval(seqTimer)
  seqTimer = undefined
  if (osc) { try { osc.stop() } catch {} osc.disconnect(); osc = null }
  if (oscGain) { oscGain.disconnect(); oscGain = null }
  if (audioEl && mediaSource) {
    try { mediaSource.disconnect() } catch {}
    mediaSource = null
  }
  if (audioEl) {
    audioEl.pause()
    if (audioEl.src.startsWith('blob:')) URL.revokeObjectURL(audioEl.src)
    audioEl = null
  }
}

function stopDemo() {
  stopAllSources()
  playing.value = false
  status.value = '已停止 · 等待你的声音'
}

function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  ensureAudio()
  if (!audioCtx || !analyser) return
  stopAllSources()
  audioEl = new Audio()
  audioEl.src = URL.createObjectURL(file)
  audioEl.crossOrigin = 'anonymous'
  mediaSource = audioCtx.createMediaElementSource(audioEl)
  mediaSource.connect(analyser)
  audioEl.play().then(() => {
    playing.value = true
    status.value = '正在播放 · ' + file.name
  }).catch(() => {
    status.value = '无法播放该文件，请尝试其他格式'
    playing.value = false
  })
  input.value = ''
}

function draw(t: number) {
  const c = canvas.value
  if (!c) return
  ctx = ctx || c.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = c.clientWidth
  const h = c.clientHeight
  if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr)
  if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // aurora backdrop
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#080b1c')
  g.addColorStop(1, '#101431')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const col = currentMode.value.color
  const live = playing.value && analyser
  if (live && analyser) {
    analyser.getByteFrequencyData(fdata as unknown as Uint8Array<ArrayBuffer>)
    analyser.getByteTimeDomainData(tdata as unknown as Uint8Array<ArrayBuffer>)
  }

  if (mode.value === 'wave') {
    ctx.strokeStyle = col
    ctx.lineWidth = 2
    ctx.shadowColor = col
    ctx.shadowBlur = 16
    ctx.beginPath()
    const N = live ? tdata.length : 120
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w
      let y = h / 2
      if (live) y = h / 2 + ((tdata[i] - 128) / 128) * h * 0.4
      else y = h / 2 + Math.sin(i * 0.08 + t / 500) * h * 0.16
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  } else if (mode.value === 'spec') {
    const bars = live ? 96 : 48
    const step = Math.floor((live ? fdata.length : 96) / bars)
    const bw = w / bars
    for (let i = 0; i < bars; i++) {
      let v = 0
      if (live) v = fdata[i * step] / 255
      else v = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.3 + t / 600))
      const bh = v * h * 0.82
      const gr = ctx.createLinearGradient(0, h - bh, 0, h)
      gr.addColorStop(0, col)
      gr.addColorStop(1, col + '22')
      ctx.fillStyle = gr
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh)
    }
  } else if (mode.value === 'parts') {
    const amp = live ? fdata.slice(0, 40).reduce((a, b) => a + b, 0) / (40 * 255) : 0.4
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2
      const rr = 40 + (i % 7) * 16 + amp * 60
      const x = w / 2 + Math.cos(a + t / 2200 + i * 0.05) * rr
      const y = h / 2 + Math.sin(a * 1.3 + t / 1900) * rr * 0.6
      const s = 1.5 + amp * 6 * (0.5 + 0.5 * Math.sin(i + t / 400))
      ctx.fillStyle = col
      ctx.globalAlpha = 0.5 + amp * 0.4
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else if (mode.value === 'fluid') {
    const rows = 40
    for (let r = 0; r < rows; r++) {
      const baseY = (r / rows) * h
      ctx.beginPath()
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 2
      for (let i = 0; i <= 120; i++) {
        const x = (i / 120) * w
        let off = Math.sin(i * 0.06 + t / 600 + r * 0.5) * 14
        if (live) {
          const fi = Math.floor((i / 120) * fdata.length)
          off += ((fdata[fi] - 128) / 128) * 22 * (1 - r / rows)
        }
        const y = baseY + off
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.shadowBlur = 0
  raf = requestAnimationFrame(draw)
}

onMounted(() => {
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  stopAllSources()
  audioCtx?.close()
})
</script>

<template>
  <div class="lab">
    <header class="masthead">
      <div class="masthead-brand">
        <span class="dot">◉</span>
        <span class="brand-text"><b>声音形状</b><i>ECHO FORMS · 生成艺术实验室</i></span>
      </div>
      <div class="status" :class="{ live: playing }"><i></i>{{ status }}</div>
    </header>

    <section class="hero">
      <p class="kicker">GENERATIVE AUDIO VISUALS</p>
      <h1 class="hero-title">声音<br /><em>有形状</em></h1>
      <p class="hero-sub">
        每一段声音，都能变成看得见的形态。用内置合成器演奏一段旋律，
        或者选一首你电脑里的歌，再看它如何化作波形、频谱、粒子与流体。
        没有你的操作，这里不会发出任何声音。
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary" @click="playing ? stopDemo() : playDemo()">
          {{ playing ? '停止播放' : '播放内置演示' }}
        </button>
        <button class="btn" @click="fileInput?.click()">选择本地音频</button>
        <input ref="fileInput" type="file" accept="audio/*" hidden @change="onFile" />
      </div>
    </section>

    <section class="stage">
      <div class="stage-head">
        <div>
          <p class="kicker">SIGNATURE INTERACTION</p>
          <h2>实时可视化 <span>· Visualizer</span></h2>
        </div>
        <div class="mode-switch">
          <button v-for="m in modes" :key="m.id" :class="{ on: mode === m.id }" @click="mode = m.id">
            {{ m.name }}
          </button>
        </div>
      </div>
      <div class="viz-frame" :style="{ '--mc': currentMode.color }">
        <canvas ref="canvas" class="viz"></canvas>
        <div class="viz-label">
          <b>{{ currentMode.name }}</b>
          <span>{{ currentMode.en }} — {{ currentMode.desc }}</span>
        </div>
      </div>
    </section>

    <section class="modes">
      <div class="stage-head">
        <div>
          <p class="kicker">FOUR VISUAL MODES</p>
          <h2>四种形态 <span>· The Modes</span></h2>
        </div>
      </div>
      <div class="mode-grid">
        <button v-for="m in modes" :key="m.id" class="mode-card" :class="{ on: mode === m.id }" :style="{ '--mc': m.color }" @click="mode = m.id">
          <span class="mode-num">0{{ modes.indexOf(m) + 1 }}</span>
          <h3>{{ m.name }} <i>{{ m.en }}</i></h3>
          <p>{{ m.desc }}</p>
        </button>
      </div>
    </section>

    <section class="about">
      <div class="about-inner">
        <h2>关于这个实验室</h2>
        <p>
          《声音形状》使用 Web Audio API 的实时分析节点，把声音的时域与频域信号
          转译成波形、频谱、粒子与流体四种形态。所有视觉由 Canvas 原创绘制，
          声音只在你主动点击或选择文件后播放，绝不自动出声。
        </p>
        <div class="about-meta"><span>Web Audio API</span><span>Vue 3 + Canvas</span><span>无外部素材依赖</span></div>
      </div>
    </section>

    <footer class="foot"><span>声音形状 · Echo Forms</span><span>当前模式 {{ currentMode.name }}</span><span>DIGITAL VISUAL LAB</span></footer>
  </div>
</template>

<style>
:root {
  --mono: 'Cascadia Mono', Consolas, 'Courier New', monospace;
}
.lab {
  min-height: 100vh;
  background: #080b1c;
  color: #e9edff;
  font-family: var(--mono);
  overflow-x: hidden;
}
.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px clamp(18px, 4vw, 56px);
  border-bottom: 1px solid #1d2340;
}
.masthead-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dot {
  color: #6ee7ff;
  font-size: 22px;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.brand-text b {
  letter-spacing: 4px;
  font-size: 17px;
}
.brand-text i {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 2px;
  color: #7d86ad;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #7d86ad;
  letter-spacing: 1px;
}
.status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #39415f;
}
.status.live i {
  background: #65f0b2;
  box-shadow: 0 0 12px #65f0b2;
  animation: pulse 1s infinite;
}

.hero {
  padding: clamp(52px, 9vh, 110px) clamp(18px, 5vw, 90px);
  max-width: 1240px;
  margin: 0 auto;
}
.kicker {
  font-size: 11px;
  letter-spacing: 4px;
  color: #6ee7ff;
  margin: 0 0 14px;
}
.hero-title {
  font-size: clamp(52px, 11vw, 140px);
  line-height: 0.94;
  margin: 0;
  letter-spacing: 0.02em;
}
.hero-title em {
  font-style: normal;
  background: linear-gradient(90deg, #6ee7ff, #b78bff, #ff7ab8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-sub {
  max-width: 56ch;
  color: #aeb5d8;
  font-size: clamp(14px, 1.6vw, 17px);
  margin: 24px 0 0;
  line-height: 1.75;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 28px;
}
.btn {
  background: transparent;
  border: 1px solid #35406b;
  color: #e9edff;
  padding: 12px 22px;
  letter-spacing: 2px;
  font-family: var(--mono);
  transition: border-color 0.2s, background 0.2s;
}
.btn:hover {
  border-color: #6ee7ff;
}
.btn-primary {
  background: #6ee7ff;
  color: #061018;
  border-color: transparent;
  font-weight: 700;
}
.btn-primary:hover {
  filter: brightness(1.08);
}

.stage,
.modes,
.about {
  padding: clamp(44px, 7vh, 88px) clamp(18px, 4vw, 56px);
  max-width: 1240px;
  margin: 0 auto;
}
.stage-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}
.stage-head h2 {
  font-size: clamp(24px, 4vw, 44px);
  margin: 0;
  letter-spacing: 1px;
}
.stage-head h2 span {
  color: #7d86ad;
  font-weight: 400;
}
.mode-switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mode-switch button {
  background: transparent;
  border: 1px solid #35406b;
  color: #aeb5d8;
  padding: 8px 14px;
  font-family: var(--mono);
  letter-spacing: 2px;
}
.mode-switch button.on {
  border-color: var(--mc);
  color: var(--mc);
}
.viz-frame {
  --mc: #6ee7ff;
  position: relative;
  border: 1px solid #1d2340;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #080b1c;
}
.viz {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.viz-label {
  position: absolute;
  left: 16px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
}
.viz-label b {
  font-size: 18px;
  color: var(--mc);
  letter-spacing: 2px;
}
.viz-label span {
  font-size: 11px;
  color: #7d86ad;
  letter-spacing: 1px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.mode-card {
  --mc: #6ee7ff;
  text-align: left;
  background: #0d1228;
  border: 1px solid #1d2340;
  color: #e9edff;
  padding: 22px 18px;
  font-family: var(--mono);
  transition: transform 0.25s, border-color 0.25s;
}
.mode-card:hover {
  transform: translateY(-5px);
}
.mode-card.on {
  border-color: var(--mc);
}
.mode-num {
  font-size: 12px;
  color: var(--mc);
  letter-spacing: 2px;
}
.mode-card h3 {
  font-size: 20px;
  margin: 12px 0 8px;
}
.mode-card h3 i {
  display: block;
  font-style: normal;
  font-size: 11px;
  color: #7d86ad;
  letter-spacing: 2px;
}
.mode-card p {
  margin: 0;
  color: #aeb5d8;
  font-size: 13px;
  line-height: 1.6;
}

.about-inner {
  border: 1px solid #1d2340;
  background: #0d1228;
  padding: clamp(24px, 4vw, 44px);
  max-width: 820px;
}
.about-inner h2 {
  margin: 0 0 14px;
}
.about-inner p {
  color: #aeb5d8;
  line-height: 1.75;
  margin: 0 0 16px;
}
.about-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
  font-size: 12px;
  color: #7d86ad;
  letter-spacing: 1px;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 22px clamp(18px, 4vw, 56px);
  border-top: 1px solid #1d2340;
  color: #7d86ad;
  letter-spacing: 2px;
  font-size: 12px;
}

@media (max-width: 900px) {
  .mode-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 480px) {
  .mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
