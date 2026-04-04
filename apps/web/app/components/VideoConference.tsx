"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface VideoConferenceProps {
    roomName: string;
    userName: string;
    domain?: string;
    onLeft?: () => void;
}

export default function VideoConference({ roomName, userName, domain = "meet.jit.si", onLeft }: VideoConferenceProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);

    // If using the official Jitsi React SDK is too heavy, we use the iframe approach.
    // Ideally we would load the external API script.

    useEffect(() => {
        // Inject Jitsi API script
        const script = document.createElement("script");
        script.src = `https://${domain}/external_api.js`;
        script.async = true;
        script.onload = () => {
            setLoading(false);
            initJitsi();
        };
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    const initJitsi = () => {
        // @ts-ignore
        if (!window.JitsiMeetExternalAPI) return;

        const options = {
            roomName: roomName,
            width: "100%",
            height: "100%",
            parentNode: document.getElementById("jitsi-container"),
            userInfo: {
                displayName: userName
            },
            configOverwrite: {
                startWithAudioMuted: true,
                startWithVideoMuted: true
            },
            interfaceConfigOverwrite: {
                SHOW_JITSI_WATERMARK: false
            }
        };

        // @ts-ignore
        const api = new window.JitsiMeetExternalAPI(domain, options);

        api.addEventListeners({
            videoConferenceLeft: () => {
                if (onLeft) onLeft();
                api.dispose();
            }
        });
    };

    return (
        <div className="w-full h-full relative bg-gray-900">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                    <span className="ml-4">{t("meeting_loading")}</span>
                </div>
            )}
            <div id="jitsi-container" className="w-full h-full" />
        </div>
    );
}
