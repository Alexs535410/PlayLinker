import { onMounted, onUnmounted } from 'vue'

const MAX_OFFSET = 18

export function useParallaxBackground() {
  const handleMouseMove = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2
    const y = (e.clientY / window.innerHeight - 0.5) * 2
    document.documentElement.style.setProperty('--bg-offset-x', `${x * MAX_OFFSET}px`)
    document.documentElement.style.setProperty('--bg-offset-y', `${y * MAX_OFFSET}px`)
  }

  const resetOffset = () => {
    document.documentElement.style.setProperty('--bg-offset-x', '0px')
    document.documentElement.style.setProperty('--bg-offset-y', '0px')
  }

  onMounted(() => {
    resetOffset()
    window.addEventListener('mousemove', handleMouseMove)
    document.body.addEventListener('mouseleave', resetOffset)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
    document.body.removeEventListener('mouseleave', resetOffset)
    resetOffset()
  })
}
