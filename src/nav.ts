import { useEffect, useState } from 'react'

// Tiny history-based navigation: works with the Android back button and the
// iOS swipe-back gesture, without needing server routes (static hosting friendly).

export type View =
  | { name: 'home' }
  | { name: 'round' }
  | { name: 'albums' }
  | { name: 'album'; id: string }
  | { name: 'book'; id: string }
  | { name: 'settings' }

const TABS: View['name'][] = ['home', 'albums', 'settings']

export function useNavigation() {
  const [view, setView] = useState<View>(() => (history.state?.view as View) ?? { name: 'home' })

  useEffect(() => {
    if (!history.state?.view) history.replaceState({ view }, '')
    const onPop = (e: PopStateEvent) => setView((e.state?.view as View) ?? { name: 'home' })
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const go = (next: View) => {
    // Switching tabs replaces history so "back" doesn't bounce between tabs.
    if (TABS.includes(next.name) && TABS.includes(view.name)) history.replaceState({ view: next }, '')
    else history.pushState({ view: next }, '')
    setView(next)
    scrollTo(0, 0)
  }

  const back = () => (history.length > 1 ? history.back() : go({ name: 'home' }))

  return { view, go, back }
}

export type Go = (view: View) => void
