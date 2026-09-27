import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Home as HomeIcon, Images, Settings as SettingsIcon } from 'lucide-react'
import { db, useSettings } from './db'
import { syncPush } from './lib/push'
import { useNavigation, type View } from './nav'
import Home from './components/Home'
import Round from './components/Round'
import Albums from './components/Albums'
import AlbumDetail from './components/AlbumDetail'
import BookView from './components/BookView'
import Settings from './components/Settings'

export default function App() {
  const { view, go, back } = useNavigation()
  usePushSync()

  const page = (() => {
    switch (view.name) {
      case 'home':
        return <Home go={go} />
      case 'round':
        return <Round go={go} onClose={back} />
      case 'albums':
        return <Albums go={go} />
      case 'album':
        return <AlbumDetail id={view.id} go={go} onBack={back} />
      case 'book':
        return <BookView id={view.id} onBack={back} />
      case 'settings':
        return <Settings />
    }
  })()

  const showTabs = view.name !== 'round' && view.name !== 'book'

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <main className={showTabs ? 'pb-28' : ''}>{page}</main>
      {showTabs && <TabBar current={view} go={go} />}
    </div>
  )
}

/**
 * Keeps the push server's "next reminder" in step with the schedule: on app open,
 * after each round and whenever the reminder settings change. Also clears the icon badge.
 */
function usePushSync() {
  const s = useSettings()
  const lastRound = useLiveQuery(async () => (await db.rounds.orderBy('completedAt').last())?.id ?? 'none')
  useEffect(() => {
    navigator.clearAppBadge?.().catch(() => {})
  }, [])
  useEffect(() => {
    if (lastRound === undefined) return // still loading
    syncPush().catch((err) => console.warn('Push sync failed', err))
  }, [lastRound, s.cadenceDays, s.reminderWeekday, s.reminderTime])
}

function TabBar({ current, go }: { current: View; go: (v: View) => void }) {
  const tabs = [
    { view: { name: 'home' } as View, label: 'Hem', icon: HomeIcon, active: current.name === 'home' },
    { view: { name: 'albums' } as View, label: 'Album', icon: Images, active: ['albums', 'album'].includes(current.name) },
    { view: { name: 'settings' } as View, label: 'Inställningar', icon: SettingsIcon, active: current.name === 'settings' },
  ]
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl justify-around pt-2">
        {tabs.map(({ view, label, icon: Icon, active }) => (
          <button
            key={label}
            onClick={() => go(view)}
            className={`flex w-24 flex-col items-center gap-1 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}
          >
            <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
