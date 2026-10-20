export interface Mode {
  id: string
  name: string
  en: string
  desc: string
  color: string
}

export const modes: Mode[] = [
  { id: 'wave', name: '波形', en: 'Waveform', desc: '把声音的起伏画成一条会呼吸的线。', color: '#6ee7ff' },
  { id: 'spec', name: '频谱', en: 'Spectrum', desc: '把每一段频率立成一根发光的柱子。', color: '#ff7ab8' },
  { id: 'parts', name: '粒子', en: 'Particles', desc: '声音的大小，决定粒子的速度与距离。', color: '#b78bff' },
  { id: 'fluid', name: '流体', en: 'Fluid', desc: '让频段融成一条流动的光河。', color: '#65f0b2' },
]

export const scale = [220, 246.94, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]
