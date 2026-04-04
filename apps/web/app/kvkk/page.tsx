
"use client";

import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

export default function KvkkPage() {
    const { t } = useTranslation();

    return (
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif', lineHeight: '1.6' }}>
            <Link href="/" className="btn btn-ghost" style={{ marginBottom: '20px', display: 'inline-block' }}>
                ← {t('return_to_login')}
            </Link>

            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '24px' }}>
                {t('kvkk_title')}
            </h1>

            <p dangerouslySetInnerHTML={{ __html: t('kvkk_intro') }}></p>

            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '24px', marginBottom: '16px' }}>{t('kvkk_sec1_title')}</h2>
            <p>{t('kvkk_sec1_desc')}</p>
            <ul>
                <li>{t('kvkk_sec1_item1')}</li>
                <li>{t('kvkk_sec1_item2')}</li>
                <li>{t('kvkk_sec1_item3')}</li>
                <li>{t('kvkk_sec1_item4')}</li>
            </ul>

            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '24px', marginBottom: '16px' }}>{t('kvkk_sec2_title')}</h2>
            <p>{t('kvkk_sec2_desc')}</p>

            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '24px', marginBottom: '16px' }}>{t('kvkk_sec3_title')}</h2>
            <p>{t('kvkk_sec3_desc')}</p>

            <div style={{ marginTop: '40px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                    {t('kvkk_footer')}
                </p>
            </div>
        </div>
    );
}
