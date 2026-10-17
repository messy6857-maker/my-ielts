<script setup lang="ts">
const router = useRouter()
const { currentUser, login, register, syncEnabled } = useAuth()

// 已登录则直接回首页
if (currentUser.value)
  router.replace('/')

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const remember = ref(true)
const loading = ref(false)
const errorMsg = ref('')

function switchMode(m: 'login' | 'register') {
  mode.value = m
  errorMsg.value = ''
}

async function onSubmit() {
  errorMsg.value = ''
  if (!username.value.trim() || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (mode.value === 'register' && password.value !== confirmPassword.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const result = mode.value === 'login'
      ? await login(username.value, password.value, remember.value)
      : await register(username.value, password.value)
    if (result.ok) {
      router.replace('/')
    }
    else {
      errorMsg.value = result.message || '操作失败，请重试'
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-md">
      <div class="border border-gray-200 rounded-lg bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
        <h3 class="mb-1 text-xl font-bold text-gray-900 dark:text-white text-center">
          My IELTS™
        </h3>
        <p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          登录后，你的学习进度和错词本会按账号单独保存
        </p>

        <!-- tabs -->
        <ul class="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1 text-center text-sm font-medium dark:bg-gray-700">
          <li>
            <button
              class="w-full rounded-md py-2"
              :class="mode === 'login' ? 'bg-white shadow text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'"
              @click="switchMode('login')"
            >
              登录
            </button>
          </li>
          <li>
            <button
              class="w-full rounded-md py-2"
              :class="mode === 'register' ? 'bg-white shadow text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'"
              @click="switchMode('register')"
            >
              注册
            </button>
          </li>
        </ul>

        <div v-if="errorMsg" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {{ errorMsg }}
        </div>

        <form @submit.prevent="onSubmit">
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">用户名</label>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="2-20 位字母、数字、下划线或中文"
              class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-blue-500"
            >
          </div>
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">密码</label>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="至少 4 位"
              class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-blue-500"
            >
          </div>
          <div v-if="mode === 'register'" class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">确认密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="再输入一次密码"
              class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-blue-500"
            >
          </div>
          <div v-if="mode === 'login'" class="mb-4 flex items-center">
            <input
              v-model="remember"
              id="remember-me"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-600"
            >
            <label for="remember-me" class="ml-2 text-sm text-gray-600 dark:text-gray-400">记住我（下次自动登录）</label>
          </div>
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          >
            {{ loading ? '请稍候…' : (mode === 'login' ? '登 录' : '注册并登录') }}
          </button>
        </form>

        <p v-if="syncEnabled" class="mt-4 text-center text-xs text-green-600 dark:text-green-400">
          ☁️ 已开启云同步：登录后学习数据将在多设备间同步
        </p>
        <p class="mt-6 text-center text-xs text-gray-400">
          不登录也可以游客身份使用，数据只保存在本浏览器
        </p>
      </div>
    </div>
  </div>
</template>
