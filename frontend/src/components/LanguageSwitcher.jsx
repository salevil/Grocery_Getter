import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) || 'en'

  return (
    <div className="flex items-center gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => i18n.changeLanguage(lang.code)}
          aria-label={lang.label}
          title={lang.label}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
            current === lang.code
              ? 'ring-2 ring-green-500 ring-offset-1 scale-110'
              : 'opacity-60 hover:opacity-100'
          }`}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  )
}
