/* 本文件由 scripts/build-client.mjs 从 src/client.js 生成，请勿手改。
 * 改客户端源码请改 src/client.js 后运行 npm run build:client。
 * 包名 @xyb-community/bladder-workbench · 仓库 https://github.com/xyb-openharness-dsh-plugins/bladder-workbench
 * 面板 customFrame=true · 业务 left 0.65
 * AI 会话可拖宽度 25–45%（默认 35）
 */
/* 客户端入口源码（M5：从脚手架占位换成家族 customFrame 外壳）。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」，Desktop 不会替我们打包（workbench-standard §3.5），
 * 所以这里用一个零依赖的字符串替换把下面的常量注入进去：
 * 包名与仓库取自 package.json，面板参数取自 lib/layout.js，路径取自 lib/routes.js，
 * 版本取自 lib/version.js。参数仍然只有一份来源，换成生成而不是手抄，是为了避免两边漂移。
 *
 * ## 面板形态：customFrame
 *
 * 宿主把**原生会话节点**作为 `conversation` prop 交给我们排版，于是
 * - 顶栏有明确的「AI 对话 / 打开 AI 对话 / 收起 AI 对话」按钮；
 * - 中间 splitter 可用鼠标拖、可用键盘调（←/→ 步进，Home/End 到边界），
 *   区间与默认值全部来自 lib/layout.js，带 `role="separator"` 与 aria-valuenow；
 * - 收起只是隐藏面板，**不结束、不删除会话**；
 * - 宽度存 localStorage（键也来自 lib/layout.js 的 AGENT_PANE.storageKey），重开后恢复；
 * - 容器窄于 narrowBelowPx 时改为覆盖式抽屉，业务区不让位。
 *
 * 为什么本项目必须 customFrame：灌注周期与复查时间轴要能一边看资料一边追问、
 * 而全屏看膀胱镜复查/造口日记时又要能把 AI 栏收起再回来（不结束会话）。
 * 标准分栏里宿主把宽度写成注册时的静态值，服务里没有 setBusinessWidth/togglePane，
 * DOM 里也没有 splitter 节点，这两个能力都不存在（prompts/ZERO-TO-DEV.md §2.2）。
 *
 * 三条硬约束（官方 §4 / §6）：
 * 1. 根节点首个子元素必须是语义 `<header>`，并用 `--dsh-frame-leading-clearance` 避让
 *    macOS 左上角窗口按钮；顶栏三段式（左=品牌+版本 chip，中=一句状态说明，右=按钮组贴右缘）；
 * 2. 原生会话**始终挂载**（只用 display 控制显隐），卸载会丢输入框状态；
 * 3. 无会话时业务面板照常可用，依赖会话的操作在按钮处引导，不阻断业务。
 *
 * 会话集成沿用家族做法：`desktopWorkbenches.ensureSession({ folder })` 调起原生会话；
 * 开场白经 `sessions.scope(id).get('conversation').input` 填进**原生草稿**，不自动发送；
 * 拿不到宿主服务一律降级提示，不猜第二个入口。
 */
;(() => {
  window.__ModuleLoader__.load({
    id: '@xyb-community/bladder-workbench',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement

      const UI_ENTRY = '/api/bladder-workbench/ui/'
      const API_PREFIX = '/api/bladder-workbench' // 业务页 iframe 内部用相对路径，这里只作声明与排错参照
      const HEALTH_PATH = '/api/bladder-workbench/api/health'
      const VERSION = '0.1.2'
      const TITLE = '小泉宝 UroPal'
      const PANEL_TITLE = '小泉宝膀胱癌工作台'
      const SUBTITLE = '本机数据 · 记录不是诊断'
      const DESCRIPTION = '把散落的病理与分级、TURBT 与根治术、膀胱灌注周期、尿流改道与造口日常、膀胱镜复查与尿细胞学、肾功能与电解质整理成可核对、可回溯的资料。'

      /* ---- 面板参数（由 scripts/build-client.mjs 从 lib/layout.js 注入，客户端不写第二份） ---- */
      const BUSINESS_SIDE = 'left'
      const BUSINESS_WIDTH = Number('0.65')
      const CUSTOM_FRAME = 'true' === 'true'
      // 宽度在客户端里一律用**比例**（0.35），布局参数在 lib/layout.js 里用百分点（35），
      // 由 build-client.mjs 换算后再注入，所以下面的算式中不会再出现 35 / 45 这类字面量。
      const AGENT_DEFAULT = Number('0.35')
      const AGENT_MIN = Number('0.25')
      const AGENT_MAX = Number('0.45')
      const AGENT_STEP = Number('0.02')
      const NARROW_BELOW = Number('760')
      const DRAWER_MAX = Number('420')
      const WIDTH_KEY = 'uropal.agent.w'
      // 草稿暂存键只属于客户端（不是面板参数），所以留在本文件；跨版本改动要换版本后缀。
      const DRAFT_QUEUE_KEY = 'uropal.initial-drafts.v1'

      const pct = (ratio) => Math.round(ratio * 100)

      const clampWidth = (value) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return AGENT_DEFAULT
        return Math.min(AGENT_MAX, Math.max(AGENT_MIN, n))
      }
      /**
       * 对齐到步进，键盘与鼠标落在同一组取值上，避免拖出 33.7% 这种数。
       * 边界必须原样落地：最窄值往往不在步进网格上，先对齐再钳位会把「拖到最窄」
       * 变成比 min 大一格，和 aria-valuenow 宣称的区间对不上（GBM 在 0.1.4 探针里抓到过）。
       */
      const snapWidth = (value) => {
        const n = clampWidth(value)
        if (n <= AGENT_MIN) return AGENT_MIN
        if (n >= AGENT_MAX) return AGENT_MAX
        return clampWidth(Math.round(n / AGENT_STEP) * AGENT_STEP)
      }
      const round4 = (n) => Math.round(n * 10000) / 10000

      function loadWidth() {
        try {
          const saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || 'null')
          return clampWidth(saved?.width)
        } catch { return AGENT_DEFAULT }
      }
      function saveWidth(width) {
        try { localStorage.setItem(WIDTH_KEY, JSON.stringify({ width: round4(width) })) } catch { /* 隐私模式忽略 */ }
      }

      /* ---------------- 样式（青泉色，取自 prototypes/v0.1/tokens.css） ----------------
         brand #1793A6 / brand-ink #0D5A66 / brand-soft #E7F4F7 / action #0F6E7D /
         paper #F6FAFB / surface #FFFFFF / ink #1E3A42 / muted #4E6B74 / line #CFE0E5。
         版本 chip 刻意用中性色（不跟品牌色），避免和品牌字标抢注意力。 */

      const C = {
        brand: '#1793A6',
        brandInk: '#0D5A66',
        soft: '#E7F4F7',
        action: '#0F6E7D',
        paper: '#F6FAFB',
        card: '#FFFFFF',
        ink: '#1E3A42',
        muted: '#4E6B74',
        line: '#CFE0E5',
        chip: '#6B7A80',
        chipBg: '#ECF0F1',
      }

      const rootStyle = {
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0,
        width: '100%', maxWidth: '100%', boxSizing: 'border-box',
        background: C.paper, fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      }
      // 首个子元素必须是语义 <header>：宿主为 macOS 窗口按钮预留了 --dsh-frame-leading-clearance。
      const headerStyle = {
        display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto', flexWrap: 'wrap',
        padding: '6px 12px', paddingInlineStart: 'var(--dsh-frame-leading-clearance, 12px)',
        borderBottom: `1px solid ${C.line}`, background: C.soft, fontSize: 12,
      }
      const brandStyle = {
        display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: C.brandInk,
        whiteSpace: 'nowrap', fontSize: 12.5,
      }
      const verStyle = {
        fontWeight: 500, fontSize: 11, color: C.chip, background: C.chipBg,
        borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap',
      }
      // 中段一句状态说明：flex:1 + minWidth 保证它吃掉剩余空间，把按钮组挤到最右。
      const hintStyle = { flex: 1, minWidth: 200, color: C.muted, fontSize: 11.5 }
      const headerActionsStyle = {
        display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto',
      }
      const bodyStyle = { position: 'relative', display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }
      const businessStyle = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }
      const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' }
      const paneStyle = {
        display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, minHeight: 0,
        borderLeft: `1px solid ${C.line}`, background: C.card, overflow: 'hidden',
      }
      const drawerStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3,
        boxShadow: '0 0 24px rgba(23, 147, 166, 0.16)',
      }
      const splitterStyle = {
        position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
        zIndex: 2, background: C.line, cursor: 'col-resize', touchAction: 'none',
        transition: 'background .15s ease, box-shadow .15s ease',
      }

      /* 分隔线（全家族统一行为）：悬停显示本工作台同色系品牌色 + 发光把手；按住左右拖动调 AI 面板宽度 */
      const SPLITTER_BRAND = C.brandInk
      const splitterRgba = (hex, alpha) => {
        const n = parseInt(String(hex).replace('#', ''), 16)
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }
      const splitterHoverStyle = {
        ...splitterStyle,
        background: SPLITTER_BRAND,
        boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
      }
      const splitterDragStyle = {
        ...splitterHoverStyle,
        boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
      }
      const splitterHitStyle = {
        position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
        background: 'transparent', cursor: 'col-resize',
      }
      const splitterGripStyle = {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
        color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
        opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
      }
      const dragShieldStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4,
        cursor: 'col-resize', background: 'transparent', touchAction: 'none',
      }
      const fallbackStyle = { padding: 24, color: C.brandInk, fontSize: 14, lineHeight: 1.7 }
      const buttonStyle = {
        border: 0, borderRadius: 999, padding: '5px 14px', whiteSpace: 'nowrap',
        background: C.action, color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
      }
      const ghostStyle = { ...buttonStyle, background: 'transparent', color: C.brandInk, border: `1px solid ${C.line}` }
      const padStyle = {
        display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center',
        padding: 20, color: C.muted, fontSize: 12.5, lineHeight: 1.75,
      }

      function Fallback({ onRetry }) {
        return h('div', { style: fallbackStyle },
          h('p', null, `页面没能加载（v${VERSION} · ${UI_ENTRY}）。常见原因是 Harness 刚重启、插件还没加载完。`),
          h('p', null, '本工作台的数据只存在你选择的本机目录里，不会因为这个提示丢失。'),
          h('button', { type: 'button', style: buttonStyle, onClick: onRetry }, '重新加载'),
        )
      }

      /* ---------------- 会话判定（官方 dsh-site-selection 同款） ---------------- */

      let bridge = null
      function currentSession() {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.currentSession === 'function') return service.currentSession() || null
        const snapshot = bridge?.sessions?.list?.getSnapshot?.()
        return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
          (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null
      }
      function workbenchOwnsSession(sessionId) {
        if (!sessionId) return false
        const service = bridge?.desktopWorkbenches
        if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId)
        return false
      }
      function ownedSession() {
        const id = currentSession()
        return workbenchOwnsSession(id) ? id : null
      }

      /* ---------------- 原生草稿：只填入，不发送 ---------------- */

      function fillDraft(sessionId, prompt) {
        if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作')
        const actx = bridge.sessions.scope?.(sessionId)
        const conversation = actx?.get?.('conversation')
        if (!conversation) throw new Error('对话输入不可用')
        const input = conversation.input.for(actx)
        const snapshot = input.state.getSnapshot()
        if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
          throw new Error('当前草稿含引用或特殊输入，请先在原生会话里处理，再交给小泉宝')
        }
        const current = snapshot.draft || ''
        input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt)
      }

      let pendingDraft = null // { sessionId, prompt }
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_QUEUE_KEY) || 'null')
        if (saved?.sessionId && saved?.prompt) pendingDraft = saved
      } catch { /* 隐私模式忽略 */ }
      function rememberDraft(entry) {
        pendingDraft = entry
        try {
          if (entry) localStorage.setItem(DRAFT_QUEUE_KEY, JSON.stringify(entry))
          else localStorage.removeItem(DRAFT_QUEUE_KEY)
        } catch { /* 隐私模式忽略 */ }
      }
      function flushDraft() {
        if (!pendingDraft) return false
        try {
          fillDraft(pendingDraft.sessionId, pendingDraft.prompt)
          rememberDraft(null)
          return true
        } catch { return false // composer 未就绪就留给下一轮
        }
      }

      /**
       * 开场白。两处膀胱癌特有的读报告常识写在这里，而不是写成"帮你判断"：
       * 「未见肌层」只说明这次标本没取到肌层、分期可能不完整，既不是好消息也不代表更坏。
       */
      function onboardingPrompt(dir) {
        return [
          '你正在协助我使用「小泉宝 UroPal 膀胱癌工作台」。它只做本机资料整理，不提供诊疗建议。',
          `资料目录：${dir || '（首次打开时在面板里选择）'}`,
          '里面是我的病理与分级、TURBT 与二次电切记录、膀胱灌注周期、尿流改道与造口日常、膀胱镜复查与尿细胞学、肾功能与电解质、症状与用药记录。',
          '我的情况通常在两条线之一：NMIBC 保膀胱线（TURBT + 灌注 + 定期膀胱镜复查），或 MIBC 根治与改道线（根治性膀胱切除 + 尿流改道/造口）。两条线要整理的资料不一样，你先问我在哪条线上。',
          '有一处读报告的常识请注意：病理报告写「未见肌层」时，是说这次标本里没有取到肌层、分期可能不完整；它既不是好消息，也不代表更坏。别替我往任何一边解释。',
          '分工：你帮我汇总、找缺漏、把报告里的指标和日期整理成对照表；判断和决定由我和治疗团队做。',
          '我标记的“看法”是我自己的担心或判断，不是医生结论。',
        ].join('\n')
      }

      /* ---------------- 面板（customFrame） ---------------- */

      function Panel({ conversation }) {
        const [generation, setGeneration] = React.useState(0)
        const [broken, setBroken] = React.useState(false)
        const [note, setNote] = React.useState('')
        const [width, setWidth] = React.useState(loadWidth)
        const [paneOpen, setPaneOpen] = React.useState(true)
        const [connecting, setConnecting] = React.useState(false)
        const [narrow, setNarrow] = React.useState(false)
        const [dragging, setDragging] = React.useState(false)
        const [hovering, setHovering] = React.useState(false)

        const brokenTimer = React.useRef(null)
        const shellRef = React.useRef(null)
        const dragHostRef = React.useRef(null)
        const frameRef = React.useRef(null)

        /* `conversation` 这个 prop 只说明"宿主把原生会话的挂载点交给我们了"，它在本工作台
           处于 active 时**恒为真**（宿主传的是 display:none 的容器），并不代表已经有会话。
           所以"有没有可用会话"只能问 desktopWorkbenches：当前会话是否绑定到本工作台。
           把 Boolean(conversation) 当会话判据，按钮一上来就是「收起 AI 对话」，
           点击只切显隐、永远走不到 ensureSession —— 这是"拉不起原生 pane"的直接原因。 */
        const canOpenSession = typeof bridge?.desktopWorkbenches?.ensureSession === 'function'
        const [sessionId, setSessionId] = React.useState(() => ownedSession())
        const hasSession = Boolean(sessionId)

        // 8 秒内没有 onLoad 就当作没起来：宁可给一个能重试的提示，也不留一块白板。
        React.useEffect(() => {
          setBroken(false)
          brokenTimer.current = setTimeout(() => setBroken(true), 8000)
          return () => clearTimeout(brokenTimer.current)
        }, [generation])

        /* 草稿刷新 + 会话归属同步。会话归属只由宿主决定：subscribe 与 400ms 轮询双保险，
           避免出现"会话其实建好了，界面还停在未连接"这种半截状态。注意别在这里 setNote('')：
           ensureSession 成功后的提示会被紧随其后的 publish 立刻擦掉。 */
        React.useEffect(() => {
          const sync = () => {
            const next = ownedSession()
            setSessionId((prev) => (prev === next ? prev : next))
            if (flushDraft()) setNote('草稿已填入会话，按回车发送')
          }
          sync()
          const timer = setInterval(sync, 400)
          const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(sync)
          return () => { clearInterval(timer); unsubscribe?.() }
        }, [])

        // 窄屏判定用**容器宽度**而不是窗口宽度：宿主主区宽度不等于窗口宽度。
        React.useEffect(() => {
          const host = shellRef.current
          if (!host || typeof ResizeObserver !== 'function') return undefined
          const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width ?? 0
            setNarrow(w > 0 && w < NARROW_BELOW)
          })
          observer.observe(host)
          return () => observer.disconnect()
        }, [])

        const applyWidth = React.useCallback((next) => {
          const snapped = round4(snapWidth(next))
          setWidth(snapped)
          saveWidth(snapped)
        }, [])

        /* ---- splitter：鼠标/触控拖动 ---- */

        const stopDrag = React.useCallback(() => {
          dragHostRef.current = null
          setDragging(false)
        }, [])

        React.useEffect(() => {
          if (!dragging) return undefined
          const onMove = (event) => {
            const host = dragHostRef.current
            if (!host) return
            const rect = host.getBoundingClientRect()
            if (!rect.width) return
            // 会话在右侧：指针越靠左，会话越宽
            applyWidth((rect.right - event.clientX) / rect.width)
          }
          document.addEventListener('pointermove', onMove)
          document.addEventListener('pointerup', stopDrag)
          document.addEventListener('pointercancel', stopDrag)
          return () => {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', stopDrag)
            document.removeEventListener('pointercancel', stopDrag)
          }
        }, [dragging, applyWidth, stopDrag])

        const onSplitterPointerDown = (event) => {
          event.preventDefault()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 旧宿主无指针捕获：document 监听仍可拖动 */ }
          dragHostRef.current = shellRef.current
          setDragging(true)
        }

        const onSplitterKeyDown = (event) => {
          const delta = { ArrowLeft: AGENT_STEP, ArrowRight: -AGENT_STEP }[event.key] // 会话在右：← 变宽
          if (delta !== undefined) { event.preventDefault(); applyWidth(width + delta); return }
          if (event.key === 'Home') { event.preventDefault(); applyWidth(AGENT_MAX); return }
          if (event.key === 'End') { event.preventDefault(); applyWidth(AGENT_MIN) }
        }

        /* ---- 打开 / 收起 AI 对话 ---- */

        async function openAgent(prompt = null) {
          setNote('')
          if (!canOpenSession) {
            setNote('当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话')
            return
          }
          setConnecting(true)
          try {
            let dir = null
            try {
              const res = await fetch(HEALTH_PATH)
              const payload = await res.json()
              const raw = typeof payload?.dir === 'string' ? payload.dir.trim() : ''
              dir = raw || null
            } catch { /* 宿主还没起来 / 网络失败：下面按"缺目录"处理，给出可执行的提示 */ }
            if (!dir) {
              // ensureSession 对空 folder 只会抛「创建会话需要业务项目文件夹。」，
              // 那句话看不出是服务端漏字段。这里先自己拦下来，说清该做什么。
              setNote('没能调起会话：服务没有给出资料目录。请重启 DSH Desktop 后重试（若仍如此，说明装机版本早于 0.1.4）')
              return
            }
            const id = await bridge.desktopWorkbenches.ensureSession({ folder: dir })
            rememberDraft({ sessionId: id, prompt: prompt || onboardingPrompt(dir) })
            const filled = flushDraft()
            setPaneOpen(true)
            setNote(filled
              ? '会话已就绪：草稿已填入右侧输入框，按回车发送'
              : '会话已就绪；输入框稍后可用，草稿会自动填入')
          } catch (error) {
            setNote(`没能调起会话：${error?.message ?? error}`)
          } finally {
            setConnecting(false)
          }
        }

        // 收起只是隐藏，不是关闭/删除会话：再点「打开 AI 对话」回到同一个会话。
        // 没有会话时这个按钮必须是**建立会话**，不能是切显隐。
        function onAgentClick() {
          if (!hasSession) { void openAgent(); return }
          setPaneOpen((open) => !open)
          setNote('')
        }

        /* ---- 业务页发来的「与 Agent 讨论」草稿：只填输入框，不发送 ---- */

        async function deliverContext(prompt) {
          const id = ownedSession()
          if (id) {
            rememberDraft({ sessionId: id, prompt })
            setPaneOpen(true)
            setNote(flushDraft()
              ? '已把这一页的内容填入会话草稿，按回车发送'
              : '会话输入框还没就绪；草稿已暂存，就绪后自动填入')
            return
          }
          setNote('正在为你调起 AI 会话…')
          await openAgent(prompt)
        }

        // handler 每轮都换成最新的闭包，effect 只注册一次。
        const deliverRef = React.useRef(null)
        React.useEffect(() => { deliverRef.current = deliverContext })
        React.useEffect(() => {
          function onMessage(event) {
            const data = event.data
            if (!data || typeof data !== 'object' || data.type !== 'bladder:agent-draft') return
            const frame = frameRef.current
            // 不认"谁都能发"的消息：必须来自我们自己的 iframe，且同源。
            if (!frame || event.source !== frame.contentWindow) return
            if (event.origin !== window.location.origin) return
            const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
            if (!prompt) return
            void deliverRef.current?.(prompt.slice(0, 8000))
          }
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        }, [])

        // 五态文案（规范固定）：未连接 / 连接中 / 已连接（收起|打开）/ 能力不可用
        const agentLabel = !canOpenSession
          ? 'AI 对话暂不可用'
          : connecting ? '正在连接…'
            : !hasSession ? 'AI 对话'
              : paneOpen ? '收起 AI 对话' : '打开 AI 对话'

        if (broken) return h(Fallback, { onRetry: () => setGeneration((n) => n + 1) })

        const percent = pct(width)
        const paneVisible = paneOpen && (hasSession || connecting)

        return h('div', { style: rootStyle },
          h('header', { style: headerStyle },
            h('span', { style: brandStyle }, `💧 ${TITLE}`),
            h('span', { style: verStyle }, `v${VERSION}`),
            h('span', { style: hintStyle },
              hasSession
                ? `右侧是 DSH 原生会话：可拖中间分隔边调整宽度（${pct(AGENT_MIN)}%–${pct(AGENT_MAX)}%），收起不会结束会话。`
                : '还没有会话。点右侧「AI 对话」调起原生会话，开场白只填进草稿，不自动发送。'),
            h('div', { style: headerActionsStyle },
              h('button', {
                type: 'button',
                style: buttonStyle,
                onClick: onAgentClick,
                disabled: connecting || !canOpenSession,
                'aria-label': `AI 对话：${agentLabel}`,
              }, agentLabel),
              hasSession && paneOpen && h('button', {
                type: 'button', style: ghostStyle, onClick: () => setPaneOpen(false),
                'aria-label': '收起 AI 对话面板',
              }, '×'),
              note && h('span', { style: { color: C.brandInk, fontWeight: 600 } }, note),
            ),
          ),
          h('div', { ref: shellRef, style: bodyStyle },
            h('div', { style: businessStyle },
              h('iframe', {
                key: generation,
                ref: frameRef,
                src: UI_ENTRY,
                title: `${TITLE} · ${SUBTITLE}`,
                style: frameStyle,
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
                onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current) },
              }),
            ),
            !narrow && paneVisible && h('div', {
              role: 'separator',
              'aria-orientation': 'vertical',
              'aria-label': '调整 AI 对话面板宽度',
              'aria-valuemin': pct(AGENT_MIN),
              'aria-valuemax': pct(AGENT_MAX),
              'aria-valuenow': percent,
              tabIndex: 0,
              style: {
                ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
                right: `${percent}%`,
              },
              onPointerDown: onSplitterPointerDown,
              onPointerEnter: () => setHovering(true),
              onPointerLeave: () => setHovering(false),
              onKeyDown: onSplitterKeyDown,
            },
              h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
              (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
            dragging && !narrow && h('div', { 'aria-hidden': 'true', style: dragShieldStyle }),
            // 原生会话**始终挂载**：卸载会丢掉输入框与草稿状态，隐藏走 display。
            h('aside', {
              style: {
                ...paneStyle,
                ...(narrow ? drawerStyle : null),
                width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
                display: paneVisible ? 'flex' : 'none',
              },
              'aria-label': 'AI 对话',
              'aria-hidden': paneVisible ? undefined : 'true',
            },
            // 原生会话挂载点**始终在树上**（宿主明确要求不 remount 输入树，卸载会丢草稿）：
            // 没有会话时只把它 display 掉，不由我们决定它的去留。
            conversation ? h('div', { style: { display: hasSession ? 'contents' : 'none' } }, conversation) : null,
            hasSession ? null : h('div', { style: padStyle },
              h('b', null, 'AI 对话还没开始'),
              h('span', null, '这里的 AI 对话是 DSH 原生会话，需要一个工作区落脚。点下面的按钮，我会用本工作台的资料目录建好会话并绑定。'),
              h('span', null, '没有会话也不影响记录：左侧的病理与灌注记录、膀胱镜复查、指标趋势照常可用。'),
              h('button', {
                type: 'button',
                style: { ...buttonStyle, alignSelf: 'flex-start', marginTop: 4 },
                onClick: () => void openAgent(),
                disabled: connecting || !canOpenSession,
              }, connecting ? '正在连接…' : '调起 AI 会话'),
            )),
          ),
        )
      }

      function apply(ctx) {
        bridge = ctx
        ctx.effect(() => ctx.desktopWorkbenches.register({
          title: TITLE,
          panelTitle: PANEL_TITLE,
          icon: '💧',
          repository: 'https://github.com/xyb-openharness-dsh-plugins/bladder-workbench',
          description: DESCRIPTION,
          audience: '膀胱癌患者与照护者',
          requirements: '本机数据整理；不做诊断与处置建议，判断由用户与治疗团队做出。',
          initialization: 'empty',
          embedded: true,
          version: VERSION,
          author: '小泉宝 UroPal 社区贡献者',
          // 下面几个值由 scripts/build-client.mjs 从 lib/layout.js 注入，不在这里手写第二份
          layout: { businessSide: BUSINESS_SIDE, businessWidth: BUSINESS_WIDTH },
          customFrame: CUSTOM_FRAME,
        }, Panel))
      }

      return { apply, inject: ['desktopWorkbenches', 'sessions'] }
    },
  })
})()
