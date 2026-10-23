import { useEffect } from 'react'

/** Reserve the actual header/navigation height, including after rotation/keyboard resizing. */
export function useMobileChatViewport(selectedId?: string) {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell.messaging-workspace')
    if (!shell) return
    const header = shell.querySelector<HTMLElement>('.topbar')
    const navigation = shell.querySelector<HTMLElement>('.mobile-tabbar')
    const media = window.matchMedia('(max-width: 760px)')
    const viewport = window.visualViewport
    const clear = () => {
      shell.style.removeProperty('--chat-mobile-top')
      shell.style.removeProperty('--chat-mobile-height')
    }
    const measure = () => {
      if (!media.matches) { clear(); return }
      const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0)
      const navigationHeight = selectedId ? 0 : navigation?.getBoundingClientRect().height ?? 0
      const viewportBottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0)
      shell.style.setProperty('--chat-mobile-top', `${top}px`)
      shell.style.setProperty('--chat-mobile-height', `${Math.max(0, viewportBottom - top - navigationHeight)}px`)
    }
    const observer = new ResizeObserver(measure)
    if (header) observer.observe(header)
    if (navigation) observer.observe(navigation)
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    media.addEventListener('change', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
      media.removeEventListener('change', measure)
      clear()
    }
  }, [selectedId])
}
