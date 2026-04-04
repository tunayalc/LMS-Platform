'use client';

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// Tiptap imports
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
// import { common, createLowlight } from 'lowlight';
// const lowlight = createLowlight(common);

// v2 style
import { lowlight } from 'lowlight';
import Youtube from '@tiptap/extension-youtube';

interface WysiwygEditorProps {
    content?: string;
    onChange?: (html: string) => void;
    placeholder?: string;
    editable?: boolean;
    className?: string;
}

export interface WysiwygEditorRef {
    getHTML: () => string;
    getJSON: () => any;
    setContent: (content: string) => void;
    focus: () => void;
}

// Toolbar Button Component
const ToolbarButton = ({
    onClick,
    active,
    disabled,
    children,
    title
}: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`toolbar-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
    >
        {children}
    </button>
);

// Toolbar Divider
const ToolbarDivider = () => <div className="toolbar-divider" />;

// Menu Bar Component
const MenuBar = ({ editor }: { editor: Editor | null }) => {
    if (!editor) return null;

    const addImage = () => {
        const url = window.prompt('Resim URL:');
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    };

    const addLink = () => {
        const url = window.prompt('Link URL:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    const addYoutube = () => {
        const url = window.prompt('YouTube URL:');
        if (url) {
            editor.chain().focus().setYoutubeVideo({ src: url }).run();
        }
    };

    return (
        <div className="wysiwyg-toolbar">
            {/* Text Style */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive('bold')}
                title="Kalın (Ctrl+B)"
            >
                <strong>B</strong>
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive('italic')}
                title="İtalik (Ctrl+I)"
            >
                <em>I</em>
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                active={editor.isActive('underline')}
                title="Altı Çizili (Ctrl+U)"
            >
                <u>U</u>
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive('strike')}
                title="Üstü Çizili"
            >
                <s>S</s>
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHighlight().run()}
                active={editor.isActive('highlight')}
                title="Vurgula"
            >
                🖍️
            </ToolbarButton>

            <ToolbarDivider />

            {/* Headings */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                active={editor.isActive('heading', { level: 1 })}
                title="Başlık 1"
            >
                H1
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor.isActive('heading', { level: 2 })}
                title="Başlık 2"
            >
                H2
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor.isActive('heading', { level: 3 })}
                title="Başlık 3"
            >
                H3
            </ToolbarButton>

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                active={editor.isActive({ textAlign: 'left' })}
                title="Sola Hizala"
            >
                ⬛
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                active={editor.isActive({ textAlign: 'center' })}
                title="Ortala"
            >
                ⬜
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                active={editor.isActive({ textAlign: 'right' })}
                title="Sağa Hizala"
            >
                ⬛
            </ToolbarButton>

            <ToolbarDivider />

            {/* Lists */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive('bulletList')}
                title="Madde İşareti"
            >
                •
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive('orderedList')}
                title="Numaralı Liste"
            >
                1.
            </ToolbarButton>

            <ToolbarDivider />

            {/* Blocks */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive('blockquote')}
                title="Alıntı"
            >
                ❝
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive('codeBlock')}
                title="Kod Bloğu"
            >
                {'</>'}
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Yatay Çizgi"
            >
                —
            </ToolbarButton>

            <ToolbarDivider />

            {/* Media */}
            <ToolbarButton onClick={addLink} active={editor.isActive('link')} title="Link Ekle">
                🔗
            </ToolbarButton>
            <ToolbarButton onClick={addImage} title="Resim Ekle">
                🖼️
            </ToolbarButton>
            <ToolbarButton onClick={addYoutube} title="YouTube Ekle">
                ▶️
            </ToolbarButton>

            <ToolbarDivider />

            {/* Table */}
            <ToolbarButton
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                title="Tablo Ekle"
            >
                📊
            </ToolbarButton>

            <ToolbarDivider />

            {/* Undo/Redo */}
            <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Geri Al (Ctrl+Z)"
            >
                ↩️
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Yinele (Ctrl+Y)"
            >
                ↪️
            </ToolbarButton>
        </div>
    );
};

// Main WYSIWYG Editor Component
export const WysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygEditorProps>(
    ({ content = '', onChange, placeholder = 'İçerik yazın...', editable = true, className = '' }, ref) => {
        const editor = useEditor({
            extensions: [
                StarterKit.configure({
                    codeBlock: false,
                }),
                Underline,
                Link.configure({
                    openOnClick: false,
                    HTMLAttributes: {
                        class: 'editor-link',
                    },
                }),
                TextAlign.configure({
                    types: ['heading', 'paragraph'],
                }),
                Placeholder.configure({
                    placeholder,
                }),
                Image.configure({
                    HTMLAttributes: {
                        class: 'editor-image',
                    },
                }),
                Table.configure({
                    resizable: true,
                }),
                TableRow,
                TableHeader,
                TableCell,
                Highlight.configure({
                    multicolor: true,
                }),
                CodeBlockLowlight.configure({
                    lowlight,
                }),
                Youtube.configure({
                    width: 640,
                    height: 360,
                }),
            ],
            content,
            editable,
            onUpdate: ({ editor }: { editor: Editor }) => {
                onChange?.(editor.getHTML());
            },
        });

        useImperativeHandle(ref, () => ({
            getHTML: () => editor?.getHTML() || '',
            getJSON: () => editor?.getJSON() || {},
            setContent: (newContent: string) => {
                editor?.commands.setContent(newContent);
            },
            focus: () => {
                editor?.commands.focus();
            },
        }));

        return (
            <div className={`wysiwyg-editor ${className}`}>
                <style jsx global>{`
                    .wysiwyg-editor {
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        overflow: hidden;
                        background: white;
                    }
                    .wysiwyg-toolbar {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 2px;
                        padding: 8px;
                        background: #f9fafb;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .toolbar-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 32px;
                        height: 32px;
                        padding: 0;
                        border: none;
                        background: transparent;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        color: #374151;
                        transition: all 0.15s;
                    }
                    .toolbar-btn:hover:not(.disabled) {
                        background: #e5e7eb;
                    }
                    .toolbar-btn.active {
                        background: #3b82f6;
                        color: white;
                    }
                    .toolbar-btn.disabled {
                        opacity: 0.4;
                        cursor: not-allowed;
                    }
                    .toolbar-divider {
                        width: 1px;
                        height: 24px;
                        background: #d1d5db;
                        margin: 4px 4px;
                    }
                    .ProseMirror {
                        min-height: 300px;
                        padding: 16px;
                        outline: none;
                    }
                    .ProseMirror p.is-editor-empty:first-child::before {
                        content: attr(data-placeholder);
                        float: left;
                        color: #9ca3af;
                        pointer-events: none;
                        height: 0;
                    }
                    .ProseMirror h1 {
                        font-size: 2rem;
                        font-weight: bold;
                        margin: 1rem 0;
                    }
                    .ProseMirror h2 {
                        font-size: 1.5rem;
                        font-weight: bold;
                        margin: 0.75rem 0;
                    }
                    .ProseMirror h3 {
                        font-size: 1.25rem;
                        font-weight: bold;
                        margin: 0.5rem 0;
                    }
                    .ProseMirror blockquote {
                        border-left: 4px solid #e5e7eb;
                        padding-left: 1rem;
                        margin: 1rem 0;
                        color: #6b7280;
                    }
                    .ProseMirror pre {
                        background: #1e293b;
                        color: #e2e8f0;
                        padding: 1rem;
                        border-radius: 8px;
                        overflow-x: auto;
                        font-family: monospace;
                    }
                    .ProseMirror code {
                        background: #f3f4f6;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-family: monospace;
                    }
                    .ProseMirror pre code {
                        background: transparent;
                        padding: 0;
                    }
                    .editor-link {
                        color: #3b82f6;
                        text-decoration: underline;
                    }
                    .editor-image {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                        margin: 1rem 0;
                    }
                    .ProseMirror table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 1rem 0;
                    }
                    .ProseMirror th,
                    .ProseMirror td {
                        border: 1px solid #e5e7eb;
                        padding: 8px 12px;
                        text-align: left;
                    }
                    .ProseMirror th {
                        background: #f9fafb;
                        font-weight: 600;
                    }
                    .ProseMirror mark {
                        background: #fef08a;
                        padding: 2px 0;
                    }
                    .ProseMirror ul,
                    .ProseMirror ol {
                        padding-left: 1.5rem;
                        margin: 0.5rem 0;
                    }
                    .ProseMirror hr {
                        border: none;
                        border-top: 2px solid #e5e7eb;
                        margin: 1.5rem 0;
                    }
                    .ProseMirror iframe {
                        border-radius: 8px;
                        margin: 1rem 0;
                    }
                `}</style>

                {editable && <MenuBar editor={editor} />}
                <EditorContent editor={editor} />
            </div>
        );
    }
);

WysiwygEditor.displayName = 'WysiwygEditor';

export default WysiwygEditor;
