export function studyDate(timestamp: number | Date = Date.now()): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function nextStudyDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(24, 0, 0, 0)
  return date.getTime()
}
