'use client';

import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import { useEffect, useRef } from 'react';

const ReactQuill = dynamic(async () => {
    const { default: RQ } = await import('react-quill');
    return ({ forwardedRef, ...props }: any) => {
        const Cmp = RQ as any;
        return <Cmp {...props} ref={forwardedRef} />;
    };
}, { ssr: false });

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
    const quillRef = useRef<any>(null);

    // react-quill doesn't always update placeholder after mount; keep it in sync with language changes.
    useEffect(() => {
        if (!placeholder) return;
        const editor = quillRef.current?.getEditor?.();
        const root = editor?.root as HTMLElement | undefined;
        if (root) {
            root.dataset.placeholder = placeholder;
        }
    }, [placeholder]);

    return (
        <div className={className}>
            <ReactQuill
                forwardedRef={quillRef}
                theme="snow"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
        </div>
    );
}
