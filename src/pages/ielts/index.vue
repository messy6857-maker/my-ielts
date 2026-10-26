<script setup lang="ts">
const router = useRouter()
void router.replace({ path: '/listening/keyword', query: useRoute().query })
</script>

<template>
<p role="status">
正在前往听力考点词…
</p>
</template>
