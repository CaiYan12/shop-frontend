/**
 * 命中高亮片段解析（#12）。
 *
 * 规格「命中高亮」把渲染拆成三步：先识别**成对、无属性**的 `<em>`，切分为文本段
 * 与强调段；再对**各段文本**解码一次 HTML 实体；最后用文本插值渲染。本模块只做
 * 前两步，输出分段数组，模板按 `kind` 决定是否生成 `<em>`。
 *
 * 边界（规格逐条对应）：
 * - 只认 `<em>` / `</em>` 这两个字面标记：带属性、大小写不同、`<b>` 等其它标签、
 *   `<em/>` 自闭合标记一律不当作标签；原文里的 `<` / `>` 只能以实体形式出现
 *   （ES `encoder: 'html'` 保证），因此片段里残留原始尖括号说明含未识别标记，
 *   按「不可解析」回退原字段，绝不把标签文本交给浏览器；
 * - 标记未成对（缺一半、嵌套、只有闭标签）时整段回退原字段，不做前端「修正」；
 * - 解码只做一次且逐段进行：`&amp;lt;` → `&lt;`，解码出的 `<em>` 字样仍是文本；
 * - 保留 `._index_prefix` 给的强调范围：函数不移动、不补齐、不猜测命中位置。
 *
 * 严格按文本渲染，因此组件里不需要任何 HTML 注入指令。
 */

/** 一个可渲染分段：`text` 为普通文本，`em` 为强调文本。 */
export type HighlightSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }

const EM_OPEN = '<em>'
const EM_CLOSE = '</em>'

/** 只匹配无属性的成对标记本体；其它形态留在文本里。 */
const EM_TOKEN = /<em>|<\/em>/g

/** ES `encoder: 'html'` 会转义的实体；其余实体保持原样。 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}

const ENTITY = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g

/**
 * 解码 HTML 实体**一次**：只替换原串里真实出现的实体，替换结果不再参与匹配，
 * 所以 `&amp;lt;` 得到 `&lt;` 而不是 `<`。未知实体保持原样。
 */
function decodeHtmlEntitiesOnce (text: string): string {
  if (!text.includes('&')) {
    return text
  }
  return text.replace(ENTITY, (matched, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return decodeNumericEntity(body.slice(2), 16, matched)
    }
    if (body.startsWith('#')) {
      return decodeNumericEntity(body.slice(1), 10, matched)
    }
    return NAMED_ENTITIES[body] ?? matched
  })
}

/** 数字实体解码；非法码点（越界、代理区）原样保留，不抛错。 */
function decodeNumericEntity (digits: string, radix: 10 | 16, original: string): string {
  const codePoint = Number.parseInt(digits, radix)
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return original
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return original
  }
  return String.fromCodePoint(codePoint)
}

/**
 * 把一条契约片段切成文本段 / 强调段；标记不成对或出现嵌套时返回 `null`
 * （调用方回退原字段）。切分在解码**之前**做，避免把实体解码出的 `<em>` 当标签。
 */
function splitEmphasis (fragment: string): HighlightSegment[] | null {
  const segments: HighlightSegment[] = []
  let cursor = 0
  let openAt = -1

  EM_TOKEN.lastIndex = 0
  let token: RegExpExecArray | null
  while ((token = EM_TOKEN.exec(fragment)) !== null) {
    if (token[0] === EM_OPEN) {
      // 已有未闭合的 `<em>`：嵌套或连续开标签，视为标记不成对。
      if (openAt !== -1) {
        return null
      }
      if (token.index > cursor) {
        segments.push({ kind: 'text', text: fragment.slice(cursor, token.index) })
      }
      openAt = token.index + EM_OPEN.length
      continue
    }

    // 没有对应的开标签：未成对。
    if (openAt === -1) {
      return null
    }
    segments.push({ kind: 'em', text: fragment.slice(openAt, token.index) })
    cursor = token.index + EM_CLOSE.length
    openAt = -1
  }

  // 有开标签没有闭标签：未成对。
  if (openAt !== -1) {
    return null
  }
  if (cursor < fragment.length) {
    segments.push({ kind: 'text', text: fragment.slice(cursor) })
  }

  // 合法片段里原文的尖括号都应被实体转义；残留原始尖括号只可能来自未识别标记，
  // 整段视为不可解析（回退原字段），不把 `<b>` 之类的字样交给浏览器。
  if (segments.some(segment => /[<>]/.test(segment.text))) {
    return null
  }

  // 逐段解码一次；强调范围仍由片段本身决定，函数不调整位置。
  return segments.map(segment => ({
    kind: segment.kind,
    text: decodeHtmlEntitiesOnce(segment.text),
  }))
}

/**
 * 解析一个字段的命中高亮。
 *
 * @param fragments 契约给的片段数组，只取首个片段；缺失或为空数组时回退。
 * @param fallback  未命中 / 不可解析时渲染的原文。
 * @returns 至少一个分段（回退时是单个文本段）；不会返回 `undefined`。
 */
export function parseHighlight (
  fragments: readonly string[] | undefined,
  fallback: string,
): HighlightSegment[] {
  const fragment = fragments?.[0]
  if (typeof fragment !== 'string' || fragment.length === 0) {
    return [{ kind: 'text', text: fallback }]
  }

  const segments = splitEmphasis(fragment)
  if (segments === null) {
    return [{ kind: 'text', text: fallback }]
  }

  // 去掉空段（例如 `<em></em>`）：没有可见内容时同样回退原文。
  const visible = segments.filter(segment => segment.text.length > 0)
  if (visible.length === 0) {
    return [{ kind: 'text', text: fallback }]
  }
  return visible
}
