import { useRouter } from 'vue-router'

// 站内路由栈：window.history.length 统计的是整个浏览器标签页的历史，
// 外链同标签页直进深页面时 length > 1 恒成立，"返回"会直接退回外部站。
// 这里只记站内 path：afterEach 里维护，目标等于栈倒数第二个 → 后退 pop，
// 否则去重 push；query 变化不进栈。afterEach 全应用只注册一次。
const stack: string[] = []
let wired = false

function ensureWired(router: ReturnType<typeof useRouter>) {
  if (wired)
    return
  wired = true
  // 种子：首次调用时的当前路由（新标签页直进深页面时栈里只有它，goBack 走 fallback）
  const cur = router.currentRoute.value.path
  if (cur)
    stack.push(cur)
  router.afterEach((to) => {
    const path = to.path
    if (stack.length >= 2 && stack[stack.length - 2] === path)
      stack.pop()
    else if (stack[stack.length - 1] !== path)
      stack.push(path)
    if (stack.length > 100)
      stack.splice(0, stack.length - 100)
  })
}

/**
 * 统一返回逻辑：站内栈有上一步时走浏览器历史，否则跳到指定的默认页。
 * API 签名不变。
 */
export function useGoBack(fallback = '/') {
  const router = useRouter()
  ensureWired(router)
  function goBack() {
    if (stack.length > 1)
      router.back()
    else
      router.push(fallback)
  }
  return { goBack }
}
