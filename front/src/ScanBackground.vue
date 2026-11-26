<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ scanning: boolean }>()
const canvas = ref<HTMLCanvasElement>()
let cleanup: (() => void) | undefined

onMounted(() => {
  const element = canvas.value!
  const context = element.getContext('2d')
  if (!context) return
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let width = 0
  let height = 0
  let frame = 0
  let mouseX = -1000
  let mouseY = -1000
  let pixels: { x: number; y: number; size: number; gray: string }[] = []
  const commits = [[8, 10], [8, 48], [40, 78], [40, 110], [72, 138], [72, 166], [40, 185], [8, 215], [8, 265], [8, 315]]

  function draw(now: number) {
    const ctx = context!
    const time = motion.matches ? 0 : now / 1000
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#d0d7de42'
    ctx.beginPath()
    for (let x = 0; x < width; x += 22) { ctx.moveTo(x, 64); ctx.lineTo(x, height) }
    for (let y = 64; y < height; y += 22) { ctx.moveTo(0, y); ctx.lineTo(width, y) }
    ctx.stroke()
    for (const pixel of pixels) {
      const near = motion.matches ? 0 : Math.max(0, 1 - Math.hypot(pixel.x - mouseX, pixel.y - mouseY) / 95)
      ctx.fillStyle = near > .15 ? 'rgba(31,136,61,' + near + ')' : pixel.gray
      ctx.fillRect(pixel.x, pixel.y, pixel.size, pixel.size)
    }
    if (width > 820) {
      ctx.save()
      ctx.translate(25, 95)
      ctx.strokeStyle = '#afb8c1'
      ctx.beginPath()
      ctx.moveTo(8, 0)
      ctx.lineTo(8, 315)
      ctx.moveTo(8, 48)
      for (const [x, y] of commits.slice(2, 8)) ctx.lineTo(x, y)
      ctx.stroke()
      const active = Math.floor(time * (props.scanning ? 6 : 1.2)) % commits.length
      commits.forEach(([x, y], index) => {
        ctx.fillStyle = index === active ? '#1f883d' : '#afb8c1'
        ctx.fillRect(x - 3, y - 3, 6, 6)
      })
      ctx.font = '10px monospace'
      ctx.fillStyle = '#656d76'
      ctx.fillText('HEAD', 20, 13)
      ctx.fillText('branch', 50, 79)
      ctx.fillText('merge', 20, 218)
      ctx.restore()

      ctx.save()
      ctx.translate(width - 122, 110)
      ctx.fillStyle = '#656d76'
      ctx.font = '10px monospace'
      ;['/src', '  ├ config', '  ├ core', '  └ utils', '/scan'].forEach((line, index) => ctx.fillText(line, 0, index * 19))
      for (let cell = 0; cell < 64; cell++) {
        const x = cell % 8
        const y = Math.floor(cell / 8)
        if ((x * 17 + y * 13 + x * y) % 11 < 4) continue
        ctx.fillStyle = Math.floor(time * 10) % 64 === cell && props.scanning ? '#1f883d' : '#d0d7de'
        ctx.fillRect(x * 12, 135 + y * 12, 9, 9)
      }
      if (props.scanning && !motion.matches) {
        ctx.fillStyle = '#1f883d'
        ctx.fillRect(0, 135 + (time * 75) % 95, 96, 1)
      }
      ctx.fillStyle = '#656d76'
      ctx.fillText('SCAN MATRIX', 0, 250)
      ctx.restore()
    }
    if (!motion.matches) frame = requestAnimationFrame(draw)
  }

  function resize() {
    cancelAnimationFrame(frame)
    width = element.clientWidth
    height = element.clientHeight
    const scale = Math.min(devicePixelRatio, 2)
    element.width = width * scale
    element.height = height * scale
    context!.setTransform(scale, 0, 0, scale, 0, 0)
    const edge = Math.max(25, (width - 1100) / 2 + 30)
    pixels = Array.from({ length: width > 820 ? 175 : 50 }, (_, index) => ({
      x: index % 2 ? width - Math.random() * edge : Math.random() * edge,
      y: 65 + Math.random() * (height - 65),
      size: index % 10 ? 6 : 10,
      gray: index % 3 ? '#afb8c155' : '#656d7640',
    }))
    draw(performance.now())
  }
  function move(event: PointerEvent) {
    const box = element.getBoundingClientRect()
    mouseX = event.clientX - box.left
    mouseY = event.clientY - box.top
  }
  function leave() { mouseX = mouseY = -1000 }

  const shell = element.parentElement!
  const observer = new ResizeObserver(resize)
  observer.observe(element)
  shell.addEventListener('pointermove', move)
  shell.addEventListener('pointerleave', leave)
  motion.addEventListener('change', resize)
  cleanup = () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    shell.removeEventListener('pointermove', move)
    shell.removeEventListener('pointerleave', leave)
    motion.removeEventListener('change', resize)
  }
})
onUnmounted(() => cleanup?.())
</script>

<template><canvas ref="canvas" id="back" aria-hidden="true"></canvas></template>