import React, { useState, useEffect } from "react";

interface Note {
    id: string;
    text: string;
    timestamp?: number;
    pageNumber?: number;
    color?: string;
    createdAt: string;
}

interface NotesPanelProps {
    contentId: string;
    contentType: string;
    apiBaseUrl: string;
    token: string | null;
    getCurrentTime?: () => number; // Function to get current video time
    onSeek?: (time: number) => void; // Function to seek video
}

export default function NotesPanel({ contentId, contentType, apiBaseUrl, token, getCurrentTime, onSeek }: NotesPanelProps) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (contentId && token) {
            fetchNotes();
        }
    }, [contentId, token]);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${apiBaseUrl}/api/notes/content/${contentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setNotes(data);
            }
        } catch (err) {
            console.error("Error fetching notes", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;

        const timestamp = getCurrentTime ? getCurrentTime() : undefined;

        try {
            const res = await fetch(`${apiBaseUrl}/api/notes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    contentId,
                    contentType,
                    text: newNote,
                    timestamp,
                    color: "#fef08a" // Default yellow
                })
            });

            if (res.ok) {
                const created = await res.json();
                setNotes([...notes, created]); // Optimistic update or append
                setNewNote("");
            }
        } catch (err) {
            console.error("Error adding note", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Notu silmek istediğinize emin misiniz?")) return;
        try {
            await fetch(`${apiBaseUrl}/api/notes/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotes(notes.filter(n => n.id !== id));
        } catch (err) {
            console.error("Error deleting note", err);
        }
    };

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <div className="notes-panel bg-white border-l h-full flex flex-col w-[300px] shadow-lg">
            <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex justify-between items-center">
                <span>📝 Notlarım</span>
                <span className="text-xs font-normal text-gray-500">{notes.length} not</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading && <div className="text-center text-gray-500">Yükleniyor...</div>}

                {!loading && notes.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-10">
                        Henüz not almadınız.
                    </div>
                )}

                {notes.map(note => (
                    <div key={note.id} className="bg-yellow-50 p-3 rounded border border-yellow-200 relative group text-sm">
                        <button
                            onClick={() => handleDelete(note.id)}
                            className="absolute top-1 right-1 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        >
                            Sil
                        </button>

                        {note.timestamp !== undefined && note.timestamp !== null && onSeek && (
                            <button
                                onClick={() => onSeek(note.timestamp!)}
                                className="text-blue-600 font-bold hover:underline mb-1 block text-xs"
                            >
                                ⏱ {formatTime(note.timestamp)}
                            </button>
                        )}

                        <p className="whitespace-pre-wrap">{note.text}</p>
                        <div className="text-[10px] text-gray-400 mt-2 text-right">
                            {new Date(note.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t bg-gray-50">
                <textarea
                    className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24"
                    placeholder="Notunuzu buraya yazın..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                />
                <div className="flex justify-between items-center mt-2">
                    {getCurrentTime ? (
                        <button
                            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                            onClick={() => {
                                const time = getCurrentTime();
                                setNewNote(prev => `${prev} [${formatTime(time)}] `);
                            }}
                        >
                            🕒 Şu anki süreyi ekle
                        </button>
                    ) : <div className="w-1/2"></div> /* Placeholder to maintain layout if button is hidden */}
                    <button
                        className="w-1/2 ml-2 bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        onClick={handleAddNote}
                        disabled={!newNote.trim()}
                    >
                        Ekle
                    </button>
                </div>
            </div>
        </div>
    );
}
