import { useRouter } from 'vue-router'

export function useGoBack(fallback = '/') {
  const router = useRouter()
  function goBack() {
    const back = router.options.history.state.back
    if (
      typeof back === 'string'
      && back.startsWith('/')
      && !back.startsWith('//')
    )
      router.back()
    else router.push(fallback)
  }
  return { goBack }
}
