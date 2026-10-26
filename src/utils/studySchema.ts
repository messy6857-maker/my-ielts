import { parseAIGradeResult } from './aiSchema'
import { isMistakeModule } from './studyModules'
import { isStudyBase } from './studyStorage'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function number(value: unknown, max = Number.POSITIVE_INFINITY): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
}

function integer(value: unknown, max = Number.POSITIVE_INFINITY): value is number {
  return number(value, max) && Number.isInteger(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function fields(value: Record<string, unknown>, names: string[]) {
  return names.every(name => typeof value[name] === 'string')
}

function date(value: unknown) {
  return typeof value === 'string' && /^(?:\d{4}-\d{1,2}-\d{1,2})?$/.test(value)
}

export function validateStudyValue(base: string, value: unknown): void {
  let valid = false
  if (base === 'mistakes_v1') {
    valid = Array.isArray(value) && value.every(item => object(item)
      && fields(item, ['key', 'title', 'detail'])
      && isMistakeModule(item.module)
      && (item.answers === undefined || (strings(item.answers) && item.answers.length > 0 && item.answers.every(answer => answer.trim().length > 0)))
      && integer(item.count) && item.count > 0 && number(item.firstAt) && number(item.lastAt)
      && (item.hint === undefined || typeof item.hint === 'string'))
  }
  else if (base === 'progress_v1') {
    valid = object(value) && Object.values(value).every(item => object(item)
      && integer(item.done) && integer(item.total) && item.done <= item.total && number(item.updatedAt))
  }
  else if (base.endsWith('_mastered_v1') || base === 'flashcard_checkin_v1') {
    valid = strings(value) && (base !== 'flashcard_checkin_v1' || value.every(date))
  }
  else if (base.endsWith('_daily_goal_v1')) {
    valid = integer(value, 500) && value >= 1
  }
  else if (base.endsWith('_daily_new_v1')) {
    valid = object(value) && date(value.date) && integer(value.count)
  }
  else if (base === 'sr_vocabulary_v1' || base.endsWith('_sr_v1')) {
    valid = object(value) && Object.values(value).every(item => object(item)
      && number(item.ease, 3) && item.ease >= 1.3 && integer(item.interval)
      && number(item.dueAt) && integer(item.reps) && integer(item.lapses))
  }
  else if (base.startsWith('study_time_v1')) {
    valid = object(value) && date(value.date) && integer(value.seconds)
  }
  else if (base === 'mock_history_v1') {
    valid = Array.isArray(value) && value.every(item => object(item)
      && fields(item, ['id', 'label', 'date']) && Number.isFinite(Date.parse(String(item.date)))
      && ['listening', 'reading'].includes(String(item.kind)) && integer(item.total)
      && integer(item.score) && item.score <= item.total && number(item.band, 9))
  }
  else if (/^task[12]_drafts_v1__item_/.test(base)) {
    valid = value === null || (object(value) && typeof value.text === 'string'
      && integer(value.secondsLeft, base.startsWith('task1_') ? 1200 : 2400) && number(value.updatedAt))
  }
  else if (base === 'task1_drafts_v1' || base === 'task2_drafts_v1') {
    valid = object(value) && Object.values(value).every(item => object(item)
      && typeof item.text === 'string' && integer(item.secondsLeft, base === 'task1_drafts_v1' ? 1200 : 2400) && number(item.updatedAt))
  }
  else if (base === 'task1_essays_v1' || base === 'task2_essays_v1') {
    valid = Array.isArray(value) && value.every(item => object(item)
      && fields(item, ['promptId', 'promptTitleCn', 'text']) && number(item.id)
      && integer(item.wordCount) && integer(item.secondsUsed) && number(item.createdAt)
      && (base === 'task2_essays_v1' || (number(item.overall, 9) && Array.isArray(item.criteria)
        && item.criteria.every(criterion => object(criterion)
          && typeof criterion.key === 'string' && number(criterion.score, 9)))))
  }
  else if (/^aigrade_v1_-?[a-z\d]+$/i.test(base)) {
    // Accept normalized `ta` and legacy Task 2 `tr` criterion maps.
    parseAIGradeResult(value, 'task2')
    valid = true
  }
  if (!valid)
    throw new Error(`学习数据结构异常：${base}`)
}

export function parseStudyValue(base: string, raw: string): unknown {
  if (!isStudyBase(base))
    throw new Error('未知学习模块')
  const value: unknown = JSON.parse(raw)
  validateStudyValue(base, value)
  return value
}
