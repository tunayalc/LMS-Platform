"use client";

import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    return (
        <div className="language-switcher">
            <button
                onClick={() => changeLanguage('tr')}
                style={{ fontWeight: i18n.language === 'tr' ? 'bold' : 'normal', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink)', fontSize: '0.9rem' }}
            >
                TR
            </button>
            <span style={{ color: 'var(--ink-light)' }}>|</span>
            <button
                onClick={() => changeLanguage('en')}
                style={{ fontWeight: i18n.language === 'en' ? 'bold' : 'normal', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink)', fontSize: '0.9rem' }}
            >
                EN
            </button>
            <span style={{ color: 'var(--ink-light)' }}>|</span>
            <button
                onClick={() => changeLanguage('de')}
                style={{ fontWeight: i18n.language === 'de' ? 'bold' : 'normal', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink)', fontSize: '0.9rem' }}
            >
                DE
            </button>
            <span style={{ color: 'var(--ink-light)' }}>|</span>
            <button
                onClick={() => changeLanguage('fr')}
                style={{ fontWeight: i18n.language === 'fr' ? 'bold' : 'normal', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink)', fontSize: '0.9rem' }}
            >
                FR
            </button>
        </div>
    );
}
