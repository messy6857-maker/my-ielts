import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { accountKey, storageFailures, writerId } from '../utils/storage'
import { accountNotice, onBeforeLogout, useAuth } from './useAuth'

export interface ExamDraft {
  version: 1
  kind: 'reading' | 'listening'
  testId: string
  answers: Record<string, string>
  timeLeft: number
  extra?: any
  submitted?: boolean
  updatedAt: number
}
export function useExamRecovery(options: {
  kind: ExamDraft['kind']
  testId: Ref<string>
  started: Ref<boolean>
  submitted: Ref<boolean>
  answers: Ref<Record<string, string>>
  timeLeft: Ref<number>
  pause: () => void
  remaining: () => number
  extra?: () => unknown
  onUnblocked?: () => void
}) {
  // owner 跟随考试生命周期：未开考或已交卷时跟随当前身份，切号不阻断开始；
  // 开考后锁定为开考身份，只有此时切号才阻断。上一版在 setup 捕获一次，
  // 导致游客挂载后登录、登录挂载后登出都会永久 blocked。
  const owner = ref(useAuth().currentUser.value)
  let activeTestId = options.testId.value
  let pauseMessage = ''
  let wasBlocked = false
  const writer = writerId()
  const baseKey = (id = options.testId.value) =>
    accountKey(`mock_draft_v1_${options.kind}_${encodeURIComponent(id)}`, owner.value)
  const key = (id = options.testId.value) => `${baseKey(id)}__session_${writer}`
  const blocked = computed(() => options.started.value && !options.submitted.value && useAuth().currentUser.value !== owner.value)
  const error = ref('')
  const draft = ref<ExamDraft | null>(null)
  // 时间戳墓碑：弃稿/交卷只写墓碑，不删其他会话的草稿文件。
  // 墓碑键与草稿键前缀不同（mock_tombstone_v1_，不是 mock_draft_v1_），
  // 因此不会被草稿扫描、备份扫描误当成草稿。
  // 取舍（a 与 b 同一机制的两面，只能二选一地折中，无法仅凭时间戳区分意图）：
  // - 过期快照（updatedAt <= clearedAt）在加载时忽略并删除，弃稿后不再
  //   offer“继续”，交卷后不再产生第二条历史记录；
  // - 活页签下一次主动保存（答题 watcher）的时间戳 > clearedAt，草稿不受影响；
  // - 但墓碑无法区分“弃稿后又在旧页签里新作答”和“活页签继续作答”：旧页签
  //   一旦主动改答案并保存，就会以新时间戳复活为有效草稿，这是本设计的残留边界。
  //   彻底区分需要 storage 广播/会话心跳，不在本项最小改动内。
  // - 被动保存（切后台/关页签/切题/账号变化/登出）不产生新作答意图：用
  //   epoch 而不用毫秒比较判断过期——begin() 与每次成功保存把“已越过的墓碑”
  //   记下来，被动保存时若出现更新的墓碑且本页签未越过它，一律拒绝写入并
  //   删除本会话快照，因此“只是关掉另一页签”不会把草稿写回来。毫秒比较
  //   在同毫秒内分不出先后（begin/保存/弃稿可发生在同一毫秒），只用它会
  //   让弃稿后立刻关页签的旧快照漏网，所以被动保存不用它。
  // - 加载时过期判断用 <=（收尾批改动）：与墓碑同一毫秒的快照也按过期
  //   处理，不再多活一次加载。弃稿后立刻重开的新草稿若恰好与墓碑同毫秒
  //   写入，首轮 refresh 可能误删它；但活页签下次主动保存（答题 watcher）
  //   的时间戳必晚于墓碑，即自愈——残留窗口仅为“同毫秒重开且重开后、
  //   下次保存前发生刷新/重载”这一种，属 clear-win 取舍。
  interface ExamTombstone {
    account: string | null
    paper: string
    clearedAt: number
  }
  const tombstoneKey = (id = options.testId.value) =>
    accountKey(`mock_tombstone_v1_${options.kind}_${encodeURIComponent(id)}`, owner.value)
  const paperOf = (id: string) => `${options.kind}:${id}`
  function readTombstone(id: string): ExamTombstone | null {
    try {
      const raw = localStorage.getItem(tombstoneKey(id))
      if (!raw)
        return null
      const t = JSON.parse(raw) as ExamTombstone | null
      return t
        && t.paper === paperOf(id)
        && t.account === owner.value
        && Number.isFinite(t.clearedAt)
        && t.clearedAt > 0
        ? t
        : null
    }
    catch {
      return null
    }
  }
  function writeTombstone(id: string) {
    try {
      localStorage.setItem(tombstoneKey(id), JSON.stringify({
        account: owner.value,
        paper: paperOf(id),
        clearedAt: Date.now(),
      } satisfies ExamTombstone))
    }
    catch {
      // 墓碑写失败时退化为旧行为：过期快照仍可能被 refresh 重新 offer，
      // 但不阻塞弃稿/交卷主流程。
    }
  }
  function isExpired(d: ExamDraft, tombstone: ExamTombstone | null) {
    return !!tombstone
      && Number.isFinite(d.updatedAt)
      && d.updatedAt <= tombstone.clearedAt
  }
  // 每张纸（paper）每个墓碑时间戳最多全量清扫一次，避免答题 watcher
  // 每次按键都扫描全部 localStorage 键；refresh 本身仍逐项过滤过期快照。
  const prunedTombstones = new Map<string, number>()
  function pruneExpired(id: string, exceptKey?: string) {
    const tombstone = readTombstone(id)
    if (!tombstone)
      return null
    const paper = paperOf(id)
    if (prunedTombstones.get(paper) === tombstone.clearedAt)
      return tombstone
    prunedTombstones.set(paper, tombstone.clearedAt)
    const prefix = baseKey(id)
    for (const storedKey of Object.keys(localStorage)) {
      if (storedKey === exceptKey)
        continue
      if (storedKey !== prefix && !storedKey.startsWith(`${prefix}__session_`))
        continue
      try {
        const d = JSON.parse(
          localStorage.getItem(storedKey) ?? 'null',
        ) as ExamDraft | null
        if (d?.version === 1 && isExpired(d, tombstone))
          localStorage.removeItem(storedKey)
      }
      catch {
        // 读不懂的键留给 refresh 的既有过滤逻辑，不在这里删除。
      }
    }
    return tombstone
  }
  // 本页签每张纸已越过的墓碑（clearedAt）：begin() 记下开考时已有的墓碑，
  // 每次成功保存记下保存时已有的墓碑。被动保存时若墓碑更新且未被越过，
  // 说明本页签是弃稿/交卷前的旧考试，拒绝写入。begin() 之外不重置。
  const survivedTombstones = new Map<string, number>()
  function markSurvived(id: string) {
    const tombstone = readTombstone(id)
    if (tombstone) {
      const paper = paperOf(id)
      survivedTombstones.set(
        paper,
        Math.max(survivedTombstones.get(paper) ?? 0, tombstone.clearedAt),
      )
    }
  }
  function refresh() {
    const tombstone = readTombstone(options.testId.value)
    const prefix = baseKey()
    const candidates = Object.keys(localStorage)
      .filter(k => k === prefix || k.startsWith(`${prefix}__session_`))
      .flatMap((storedKey) => {
        try {
          const d = JSON.parse(
            localStorage.getItem(storedKey) ?? 'null',
          ) as ExamDraft | null
          if (d?.version === 1 && isExpired(d, tombstone)) {
            // 过期快照永不复活：加载时直接删除，下次不再 offer“继续”。
            localStorage.removeItem(storedKey)
            return []
          }
          return d?.version === 1
            && d.kind === options.kind
            && d.testId === options.testId.value
            && d.answers
            && typeof d.answers === 'object'
            && Object.values(d.answers).every(a => typeof a === 'string')
            && Number.isFinite(d.timeLeft)
            ? [{ storedKey, value: d }]
            : []
        }
        catch {
          return []
        }
      })
      .sort((a, b) => b.value.updatedAt - a.value.updatedAt)
    draft.value
      = (candidates.find(c => c.storedKey === key()) ?? candidates[0])?.value
      ?? null
  }
  function writeDraft() {
    const value: ExamDraft = {
      version: 1,
      kind: options.kind,
      testId: activeTestId,
      answers: { ...options.answers.value },
      timeLeft: Math.max(0, options.remaining()),
      extra: options.extra?.(),
      updatedAt: Date.now(),
    }
    try {
      localStorage.setItem(key(activeTestId), JSON.stringify(value))
      draft.value = value
      // 本次保存已越过保存时刻的墓碑：之后被动保存不再被它判定为过期。
      markSurvived(activeTestId)
      storageFailures.value = storageFailures.value.filter(
        k => k !== key(activeTestId),
      )
      return true
    }
    catch {
      error.value
        = '作答草稿保存失败，请先复制答案或导出可用备份，不要关闭页面。'
      if (!storageFailures.value.includes(key(activeTestId)))
        storageFailures.value = [...storageFailures.value, key(activeTestId)]
      return false
    }
  }
  // 主动保存：用户改答案（answers watcher）与开始考试后的显式保存。
  // 新快照时间戳 > clearedAt，活页签草稿不受影响；保存前先清扫其他会话
  // 的过期快照，避免它们在之后被 refresh 捡到。
  function save() {
    if (!options.started.value || options.submitted.value)
      return true
    pruneExpired(activeTestId, key(activeTestId))
    return writeDraft()
  }
  // 被动保存：切后台、关页签、切题、账号变化、登出时的 flush，不产生新作答。
  // 若出现本页签未越过的新墓碑，说明它是被弃稿/交卷的那次考试的旧页签：
  // 拒绝写入并删除本会话快照，不让“关页签”这个动作本身把草稿复活。
  // 例外：本会话快照时间戳已 > clearedAt（上一实例主动保存后重载，本实例
  // epoch 已丢），说明该草稿在墓碑后已复活为有效草稿，不视为过期。
  function saveFlush() {
    if (!options.started.value || options.submitted.value)
      return true
    const tombstone = readTombstone(activeTestId)
    let ownUpdatedAt = 0
    try {
      const raw = localStorage.getItem(key(activeTestId))
      const d = raw ? (JSON.parse(raw) as ExamDraft | null) : null
      if (d?.version === 1 && Number.isFinite(d.updatedAt))
        ownUpdatedAt = d.updatedAt
    }
    catch {
      // 快照读失败时按过期处理，refresh 仍会过滤它。
    }
    if (
      tombstone
      && tombstone.clearedAt > (survivedTombstones.get(paperOf(activeTestId)) ?? 0)
      && !(ownUpdatedAt > tombstone.clearedAt)
    ) {
      try {
        localStorage.removeItem(key(activeTestId))
      }
      catch {
        // 删失败不阻塞，refresh 仍会把过期快照过滤掉。
      }
      pruneExpired(activeTestId, key(activeTestId))
      return false
    }
    pruneExpired(activeTestId, key(activeTestId))
    return writeDraft()
  }
  // 同账号同套题同科目的全部草稿键（含无会话后缀的历史键）。
  function sessionKeysFor(id: string) {
    const prefix = baseKey(id)
    return Object.keys(localStorage)
      .filter(k => k === prefix || k.startsWith(`${prefix}__session_`))
  }
  function sessionKeys() {
    return sessionKeysFor(options.testId.value)
  }
  function clear() {
    // 弃稿只写墓碑 + 删本会话键与无会话后缀的历史键，不删其他会话文件：
    // 另一页签进行中的草稿文件得以保留，其下次主动保存时间戳 > clearedAt
    // 即恢复为有效草稿，不再有“弃稿后、活页签下次保存前崩溃即丢快照”的窗口；
    // 而弃稿前未再保存的旧快照 updatedAt <= clearedAt，refresh() 会忽略并删除，
    // 不再 offer“继续”。清当前展示套题：弃稿发生在开始屏，此时 activeTestId
    // 还是上次开考的套题，用它会清错键；交卷时两者一致，不受影响。
    writeTombstone(options.testId.value)
    try {
      localStorage.removeItem(key())
    }
    catch {
      // 本会话键删失败不阻塞弃稿，墓碑已保证它过期。
    }
    try {
      // 无会话后缀的历史键直接删除：它不属于任何活页签，留着也只会被
      // refresh 当作过期快照处理。
      localStorage.removeItem(baseKey())
    }
    catch {
      // 历史键删失败不阻塞弃稿，墓碑已保证它过期。
    }
    draft.value = null
  }
  // 交卷时先写墓碑、再把草稿标记为已交卷（无论记录保存是否成功）：
  // 开始屏不再 offer“继续”，避免对已交卷内容重复续做；记录保存失败时
  // 草稿仍保留答案。同账号同套题的其他会话草稿一并标记，否则记录保存
  // 失败（不清键）时别页签的未交卷旧快照仍会在该页签 offer“继续”。
  // 标记时把 updatedAt 抬到不低于 clearedAt；与墓碑同毫秒的已交卷快照
  // 按 <= 也算过期、refresh 时可删，但它因 submitted=true 本身就不再被
  // offer 续做，删了无影响。
  // 交卷成功后调用方随后调 clear() 写新墓碑并删本会话键，其他会话的
  // 已交卷快照若时间戳 < 新墓碑，会在之后 refresh 时被当作过期删除——
  // 已交卷快照被删无影响，它本来就不再续做。
  function markSubmitted() {
    const clearedAt = Date.now()
    writeTombstone(options.testId.value)
    const storedKey = key()
    for (const k of sessionKeys()) {
      try {
        const raw = localStorage.getItem(k)
        const d = raw ? (JSON.parse(raw) as ExamDraft | null) : null
        if (d && d.version === 1) {
          const value = {
            ...d,
            submitted: true,
            updatedAt: Math.max(Date.now(), clearedAt),
          }
          localStorage.setItem(k, JSON.stringify(value))
          if (k === storedKey)
            draft.value = value
        }
      }
      catch {
        // 单个标记失败不阻塞交卷流程
      }
    }
  }
  function dismissNotice() {
    error.value = ''
    if (accountNotice.value === pauseMessage)
      accountNotice.value = ''
  }
  function mismatch() {
    if (!blocked.value)
      return false
    const saved = saveFlush()
    const message = `账号已变化，本次模考已暂停。${saved ? `答案已保存在原身份的本机草稿中；${owner.value ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从剩余时间继续作答。` : '作答草稿保存失败，请先复制答案，不要关闭页面。'}`
    pauseMessage = message
    error.value = message
    accountNotice.value = message
    options.pause()
    wasBlocked = true
    return true
  }
  const stopOwner = watch(
    useAuth().currentUser,
    () => {
      if (!options.started.value || options.submitted.value) {
        // 未开考或已交卷：owner 跟随当前身份，切号不阻断开始/重开，
        // 也不再误报“已暂停”。
        owner.value = useAuth().currentUser.value
        return
      }
      if (mismatch())
        return
      // 回到原身份、阻断解除：恢复计时。暂停时 timer 已清，只清提示会让
      // 考试以冻结时钟继续作答、自动交卷永不触发，所以必须重建计时。
      if (wasBlocked) {
        wasBlocked = false
        options.onUnblocked?.()
      }
      // 回到原身份、阻断解除：清掉暂停提示（保存失败的提示不是暂停消息，保留）。
      if (error.value === pauseMessage)
        error.value = ''
      if (accountNotice.value === pauseMessage)
        accountNotice.value = ''
    },
    { flush: 'sync' },
  )
  // M-Opt-#3：答案写入 300ms 防抖——填空连续输入不再每次按键全量序列化
  // 写 localStorage。显式保存（startTest 的 save()）仍立即写；unmount /
  // pagehide / visibilitychange 走 saveFlush() 立即写，不受防抖影响。
  let answersTimer: ReturnType<typeof setTimeout> | null = null
  const stopAnswers = watch(options.answers, () => {
    if (answersTimer)
      clearTimeout(answersTimer)
    answersTimer = setTimeout(() => {
      answersTimer = null
      save()
    }, 300)
  }, {
    deep: true,
  })
  const stopTest = watch(options.testId, refresh)
  const offLogout = onBeforeLogout(() => {
    saveFlush()
    options.pause()
  })
  window.addEventListener('pagehide', saveFlush)
  const visibility = () => {
    if (document.visibilityState === 'hidden')
      saveFlush()
  }
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    saveFlush()
    // saveFlush 已立即写了最新答案，挂起的防抖定时器不再需要：清掉它，
    // 避免卸载后多余的一次重复写入。
    if (answersTimer) {
      clearTimeout(answersTimer)
      answersTimer = null
    }
    options.pause()
    stopOwner()
    stopAnswers()
    stopTest()
    offLogout()
    window.removeEventListener('pagehide', saveFlush)
    document.removeEventListener('visibilitychange', visibility)
  })
  refresh()
  return {
    begin() {
      owner.value = useAuth().currentUser.value
      activeTestId = options.testId.value
      // 新开考越过开考时刻已有的墓碑：弃稿后立刻重开不被旧墓碑误杀，
      // 哪怕重开与弃稿发生在同一毫秒。
      survivedTombstones.set(
        paperOf(activeTestId),
        readTombstone(activeTestId)?.clearedAt ?? 0,
      )
      wasBlocked = false
      error.value = ''
      if (accountNotice.value === pauseMessage)
        accountNotice.value = ''
    },
    owner,
    activeTestId: () => activeTestId,
    blocked,
    error,
    draft,
    refresh,
    save,
    saveFlush,
    clear,
    markSubmitted,
    dismissNotice,
    mismatch,
  }
}
