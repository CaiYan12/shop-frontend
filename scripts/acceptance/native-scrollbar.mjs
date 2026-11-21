// 原生滚动条取样：滚动到顶 / 底各拍一次，用滑块的实际位移区分滑块与轨道。
// 不假定固定 y 坐标；长内容下滑块只占顶部一小段时仍能取到正确颜色。
import { relative, sep, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export function luminance([r, g, b]) {
  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a, b) {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/**
 * @param {{ width: number, height: number, changed: Array<{y:number,top:number[],bottom:number[]}> }} rows
 * @returns {{ ratio: number|null, ratioDisplay: string|null, sampleY: number|null, thumb: number[]|null, track: number[]|null, changedCount: number, failureReason: string|null }}
 */
export function analyzeScrollbarPair(rows) {
  const changed = rows.changed ?? []
  if (changed.length === 0) {
    return {
      ratio: null,
      ratioDisplay: null,
      sampleY: null,
      thumb: null,
      track: null,
      changedCount: 0,
      failureReason: '滚动前后滚动条像素未变化，无法区分滑块与轨道',
    }
  }

  // 顶部截图滚动到 0，滑块在上；取上半区的变化行，top 是滑块、bottom 是轨道。
  // 不取整列，避免把底部“top=轨道、bottom=滑块”的反向组合当成取样行。
  const topHalf = changed.filter((row) => row.y < rows.height / 2)
  const pool = topHalf.length > 0 ? topHalf : changed
  let best = null
  for (const row of pool) {
    const ratio = contrastRatio(row.top.slice(0, 3), row.bottom.slice(0, 3))
    if (best === null || ratio > best.ratio) {
      best = { ...row, ratio }
    }
  }

  return {
    // ratio 保留原始值供门槛判断；ratioDisplay 只用于报告展示。
    ratio: best.ratio,
    ratioDisplay: best.ratio.toFixed(2),
    sampleY: best.y,
    thumb: best.top,
    track: best.bottom,
    changedCount: changed.length,
    failureReason: null,
  }
}

function rel(runDir, path) {
  return relative(runDir, path).split(sep).join('/')
}

export async function sampleNativeScrollbar(page, {
  selector,
  expectedTheme,
  parts,
  runDir,
  screenshots,
}) {
  const info = await page.eval(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    element.scrollTop = 0
    const rect = element.getBoundingClientRect()
    return {
      selector: ${JSON.stringify(selector)},
      rect: { right: rect.right, top: rect.top, width: rect.width, height: rect.height },
      scrollbarWidth: element.offsetWidth - element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollbarColor: getComputedStyle(element).scrollbarColor,
    }
  })()`)
  if (!info) {
    return {
      info: { scrollHeight: -1, clientHeight: -1, scrollbarWidth: 0 },
      overflow: false,
      themeApplied: false,
      pixels: null,
      ratio: null,
      ratioDisplay: null,
      failureReason: '找不到滚动容器',
    }
  }

  const themeClass = await page.eval(`document.querySelector('.v-application')?.className ?? ''`)
  const themeApplied = themeClass.includes(`v-theme--${expectedTheme}`)
  const overflow = info.scrollHeight > info.clientHeight + 2
  const fullPath = join(runDir, ...parts, 'full.png')
  await page.shot(fullPath)
  screenshots.push(rel(runDir, fullPath))

  if (!overflow || info.scrollbarWidth <= 0) {
    return {
      info,
      overflow,
      themeApplied,
      pixels: null,
      ratio: null,
      ratioDisplay: null,
      failureReason: !overflow
        ? `未溢出（scrollHeight=${info.scrollHeight}, clientHeight=${info.clientHeight}）`
        : `滚动条宽度为 0（${info.scrollbarWidth}）`,
    }
  }

  const clip = {
    x: Math.round(info.rect.right - info.scrollbarWidth),
    y: Math.round(info.rect.top),
    width: Math.max(1, Math.round(info.scrollbarWidth)),
    height: Math.max(1, Math.round(info.rect.height)),
    scale: 1,
  }

  await page.eval(`document.querySelector(${JSON.stringify(selector)}).scrollTop = 0`)
  await sleep(150)
  const topPath = join(runDir, ...parts, 'scrollbar-top.png')
  const topData = await page.capture(topPath, clip)
  screenshots.push(rel(runDir, topPath))

  await page.eval(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    element.scrollTop = element.scrollHeight
  })()`)
  await sleep(150)
  const bottomPath = join(runDir, ...parts, 'scrollbar-bottom.png')
  const bottomData = await page.capture(bottomPath, clip)
  screenshots.push(rel(runDir, bottomPath))

  const rows = await page.eval(`(async () => {
    const load = async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      return image
    }
    const top = await load(${JSON.stringify(`data:image/png;base64,${topData}`)})
    const bottom = await load(${JSON.stringify(`data:image/png;base64,${bottomData}`)})
    const canvas = document.createElement('canvas')
    canvas.width = top.width
    canvas.height = top.height
    const topContext = canvas.getContext('2d')
    topContext.drawImage(top, 0, 0)
    const bottomCanvas = document.createElement('canvas')
    bottomCanvas.width = bottom.width
    bottomCanvas.height = bottom.height
    const bottomContext = bottomCanvas.getContext('2d')
    bottomContext.drawImage(bottom, 0, 0)

    const read = (context, x, y) => Array.from(context.getImageData(x, y, 1, 1).data)
    const distance = (first, second) => {
      const dr = first[0] - second[0]
      const dg = first[1] - second[1]
      const db = first[2] - second[2]
      return Math.sqrt(dr * dr + dg * dg + db * db)
    }
    const x = Math.max(0, Math.min(top.width - 1, Math.floor(top.width / 2)))
    const changed = []
    for (let y = 0; y < top.height; y++) {
      const first = read(topContext, x, y)
      const second = read(bottomContext, x, y)
      if (distance(first, second) > 12) {
        changed.push({ y, top: first, bottom: second })
      }
    }
    return { width: top.width, height: top.height, sampleX: x, changed }
  })()`)

  const analysis = analyzeScrollbarPair(rows)
  return {
    info,
    overflow,
    themeApplied,
    pixels: {
      width: rows.width,
      height: rows.height,
      sampleX: rows.sampleX,
      changedCount: analysis.changedCount,
      sampleY: analysis.sampleY,
      thumb: analysis.thumb,
      track: analysis.track,
    },
    ratio: analysis.ratio,
    ratioDisplay: analysis.ratioDisplay,
    failureReason: analysis.failureReason,
  }
}
