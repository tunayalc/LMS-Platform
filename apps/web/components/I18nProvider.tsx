"use client";

import React from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";

export default function I18nProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    // @ts-ignore
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
