import { ref, watch } from 'vue'

/**
 * 字符串状态持久化到 localStorage（如页签选中状态），
 * 切换页面再回来时保持上次的状态。
 */
export function usePersistentString(key: string, defaultValue = '') {
  const state = ref(defaultValue)
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null)
      state.value = saved
  }
  catch {
    /* ignore */
  }
  watch(state, (v) => {
    try {
      localStorage.setItem(key, v)
    }
    catch {
      /* ignore */
    }
  })
  return state
}
