import LanguageSwitcher from './LanguageSwitcher'

/**
 * TopBar — global app header shown on all protected pages.
 * Contains the station wagon icon, app name, and language switcher.
 */
export default function TopBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-green-600 shadow-md">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Logo + app name */}
        <div className="flex items-center gap-2.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 120"
            className="h-9 w-auto"
            aria-hidden="true"
          >
            {/* Station wagon — same as logo.svg but no background rect */}
            <rect x="0" y="90" width="200" height="30" fill="#374151"/>
            <rect x="0" y="88" width="200" height="4" fill="#4b5563"/>
            <rect x="20" y="93" width="20" height="3" fill="#fbbf24" rx="1"/>
            <rect x="60" y="93" width="20" height="3" fill="#fbbf24" rx="1"/>
            <rect x="100" y="93" width="20" height="3" fill="#fbbf24" rx="1"/>
            <rect x="140" y="93" width="20" height="3" fill="#fbbf24" rx="1"/>
            <rect x="20" y="55" width="155" height="35" fill="#dc2626" rx="4"/>
            <path d="M45 55 L55 30 L145 30 L160 55 Z" fill="#dc2626"/>
            <path d="M45 55 L55 30 L145 30 L160 55" stroke="#991b1b" strokeWidth="1.5" fill="none"/>
            <rect x="20" y="65" width="155" height="14" fill="#92400e"/>
            <line x1="40" y1="65" x2="40" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="60" y1="65" x2="60" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="80" y1="65" x2="80" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="100" y1="65" x2="100" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="120" y1="65" x2="120" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="140" y1="65" x2="140" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <line x1="160" y1="65" x2="160" y2="79" stroke="#78350f" strokeWidth="0.8"/>
            <rect x="20" y="65" width="155" height="14" fill="none" stroke="#78350f" strokeWidth="1"/>
            <path d="M48 53 L56 33 L90 33 L90 53 Z" fill="#bfdbfe" opacity="0.9"/>
            <rect x="93" y="33" width="35" height="20" fill="#bfdbfe" opacity="0.9" rx="1"/>
            <rect x="131" y="33" width="26" height="20" fill="#bfdbfe" opacity="0.9" rx="1"/>
            <path d="M48 53 L56 33 L90 33 L90 53 Z" stroke="#1e40af" strokeWidth="1" fill="none"/>
            <rect x="93" y="33" width="35" height="20" stroke="#1e40af" strokeWidth="1" fill="none" rx="1"/>
            <rect x="131" y="33" width="26" height="20" stroke="#1e40af" strokeWidth="1" fill="none" rx="1"/>
            <rect x="20" y="55" width="155" height="35" stroke="#991b1b" strokeWidth="1.5" fill="none" rx="4"/>
            <rect x="15" y="78" width="12" height="6" fill="#6b7280" rx="2"/>
            <rect x="173" y="78" width="12" height="6" fill="#6b7280" rx="2"/>
            <rect x="17" y="60" width="8" height="5" fill="#fef08a" rx="1"/>
            <rect x="175" y="60" width="8" height="5" fill="#fca5a5" rx="1"/>
            <circle cx="55" cy="90" r="13" fill="#1f2937"/>
            <circle cx="55" cy="90" r="9" fill="#374151"/>
            <circle cx="55" cy="90" r="4" fill="#9ca3af"/>
            <circle cx="145" cy="90" r="13" fill="#1f2937"/>
            <circle cx="145" cy="90" r="9" fill="#374151"/>
            <circle cx="145" cy="90" r="4" fill="#9ca3af"/>
            <rect x="55" y="28" width="90" height="3" fill="#6b7280" rx="1"/>
            <rect x="65" y="25" width="3" height="6" fill="#6b7280" rx="1"/>
            <rect x="130" y="25" width="3" height="6" fill="#6b7280" rx="1"/>
          </svg>
          <span className="text-white font-bold text-lg leading-tight tracking-tight">
            Grocery Getter
          </span>
        </div>

        {/* Language switcher */}
        <LanguageSwitcher />
      </div>
    </header>
  )
}
