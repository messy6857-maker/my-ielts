import { ref, watch } from 'vue'

/**
 * 布尔状态持久化到 localStorage（如折叠面板的展开状态），
 * 切换页面再回来时保持上次的状态。
 */
export function usePersistentBool(key: string, defaultValue = false) {
  const state = ref(defaultValue)
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null)
      state.value = saved === '1'
  }
  catch {
    /* ignore */
  }
  watch(state, (v) => {
    try {
      localStorage.setItem(key, v ? '1' : '0')
    }
    catch {
      /* ignore */
    }
  })
  return state
}
