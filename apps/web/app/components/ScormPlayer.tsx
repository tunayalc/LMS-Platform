"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ScormPlayerProps {
    launchUrl: string;
    sessionId: string;
    apiBaseUrl: string;
    token: string;
    onExit?: () => void;
}

export default function ScormPlayer({ launchUrl, sessionId, apiBaseUrl, token, onExit }: ScormPlayerProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => {
        console.log(`[SCORM] ${msg}`);
        setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    useEffect(() => {
        // SCORM 1.2 API Adapter
        const API = {
            LMSInitialize: (param: string) => {
                addLog(`LMSInitialize('${param}')`);
                return "true";
            },
            LMSFinish: (param: string) => {
                addLog(`LMSFinish('${param}')`);
                // Notify backend of session end
                fetch(`${apiBaseUrl}/scorm/sessions/${sessionId}/end`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(err => console.error("End session failed", err));

                if (onExit) onExit();
                return "true";
            },
            LMSGetValue: (element: string) => {
                addLog(`LMSGetValue('${element}')`);
                // Synchronous fetch is deprecated/impossible in modern browsers for main thread.
                // We return empty string or cached value. 
                // For a real robust player, we'd need to pre-fetch data or use async/wait with a specific bridge.
                return "";
            },
            LMSSetValue: (element: string, value: string) => {
                addLog(`LMSSetValue('${element}', '${value}')`);
                // Send data to backend asynchronously
                fetch(`${apiBaseUrl}/scorm/sessions/${sessionId}/data`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ element, value })
                }).catch(err => console.error("Set value failed", err));

                return "true";
            },
            LMSCommit: (param: string) => {
                addLog(`LMSCommit('${param}')`);
                return "true";
            },
            LMSGetLastError: () => "0",
            LMSGetErrorString: (code: string) => "No Error",
            LMSGetDiagnostic: (code: string) => ""
        };

        // SCORM 2004 API Adapter (Functionally mapped to 1.2 for now)
        const API_1484_11 = {
            Initialize: API.LMSInitialize,
            Terminate: API.LMSFinish,
            GetValue: API.LMSGetValue,
            SetValue: API.LMSSetValue,
            Commit: API.LMSCommit,
            GetLastError: API.LMSGetLastError,
            GetErrorString: API.LMSGetErrorString,
            GetDiagnostic: API.LMSGetDiagnostic
        };

        // Expose APIs to window for iframe to find
        // @ts-ignore
        window.API = API;
        // @ts-ignore
        window.API_1484_11 = API_1484_11;

        addLog("SCORM APIs initialized on window");

        return () => {
            // Cleanup
            // @ts-ignore
            delete window.API;
            // @ts-ignore
            delete window.API_1484_11;
        };
    }, [sessionId, apiBaseUrl, token, onExit]);

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <div className="bg-white shadow p-4 flex justify-between items-center z-10">
                <h2 className="font-bold text-lg text-gray-800">SCORM Player</h2>
                <button
                    onClick={onExit}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium"
                >
                    Çıkış
                </button>
            </div>
            <div className="flex-1 relative">
                <iframe
                    ref={iframeRef}
                    src={launchUrl}
                    className="w-full h-full border-0 absolute inset-0"
                    allowFullScreen
                // Note: sandbox attribute usually blocks 'allow-same-origin' if combined with 'allow-scripts' 
                // AND we want to access parent window.
                // If we want the iframe to access window.API, they must be Same Origin, or we need to omit sandbox 
                // or use specific setup. For now, omitting sandbox to rely on default (or strict but correct) behavior.
                />
            </div>
            {/* Debug Log (Optional - typically hidden in prod) */}
            <div className="bg-black text-green-400 p-2 h-32 overflow-y-auto text-xs font-mono border-t border-gray-700 hidden">
                {logs.map((log, i) => <div key={i}>{log}</div>)}
            </div>
        </div>
    );
}
