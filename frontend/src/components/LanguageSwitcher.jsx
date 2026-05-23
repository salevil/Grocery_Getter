import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'fr', label: 'FR', name: 'Français' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) || 'en'

  return (
    <div className="relative inline-block">
      <select
        value={current}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="appearance-none bg-transparent text-sm font-medium text-gray-600 hover:text-gray-900 cursor-pointer pr-5 focus:outline-none"
        aria-label="Select language"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label} — {lang.name}
          </option>
        ))}
      </select>
      {/* Dropdown chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-3 w-3 absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}
