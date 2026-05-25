import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) || 'en'
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const currentLang = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0]
  const others = LANGUAGES.filter((l) => l.code !== current)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(code) {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      {/* Current language button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={currentLang.label}
        title={currentLang.label}
        className="w-9 h-9 rounded-full flex items-center justify-center text-xl ring-2 ring-white/40 hover:ring-white transition-all"
      >
        {currentLang.flag}
      </button>

      {/* Dropdown — other languages */}
      {open && (
        <div className="absolute right-0 top-full mt-1 flex flex-col gap-1 bg-white rounded-xl shadow-lg p-1.5 z-50">
          {others.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => select(lang.code)}
              aria-label={lang.label}
              title={lang.label}
              className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-gray-100 transition-colors"
            >
              {lang.flag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
