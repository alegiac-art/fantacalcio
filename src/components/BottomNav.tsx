'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface BottomNavProps {
  isAdmin: boolean
}

export default function BottomNav({ isAdmin }: BottomNavProps) {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/squadra', label: 'Squadra', icon: ShirtIcon },
    { href: '/classifica', label: 'Classifica', icon: TrophyIcon },
    { href: '/calendario', label: 'Calendario', icon: CalendarIcon },
    { href: '/profilo', label: 'Profilo', icon: UserIcon },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: SettingsIcon }] : []),
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 pt-3 text-xs font-medium transition-colors ${
                active ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              <Icon active={active} />
              <span className="mt-0.5">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'fill-green-600' : 'fill-gray-400'}`} viewBox="0 0 24 24">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  )
}

function ShirtIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'stroke-green-600' : 'stroke-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3h11l2 5-3.5 2v11H8V10L4.5 8l2-5z" />
    </svg>
  )
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'fill-green-600' : 'fill-gray-400'}`} viewBox="0 0 24 24">
      <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H7v2h10v-2h-4v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
    </svg>
  )
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'fill-green-600' : 'fill-gray-400'}`} viewBox="0 0 24 24">
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
    </svg>
  )
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'fill-green-600' : 'fill-gray-400'}`} viewBox="0 0 24 24">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
    </svg>
  )
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'fill-green-600' : 'fill-gray-400'}`} viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  )
}
