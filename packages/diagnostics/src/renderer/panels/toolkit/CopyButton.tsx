import { useState } from 'react';
import { Copy } from 'lucide-react';
import { IconButton } from '@/ui';

export function CopyButton({text, label = 'Copy', size = 'sm'}: { readonly text: string; readonly label?: string; readonly size?: 'sm' | 'md' }) {
    const [copied, setCopied] = useState(false);

    return (
        <IconButton
            icon={Copy}
            label={copied ? 'Copied' : label}
            size={size}
            disabled={text.length === 0}
            onClick={() => {
                void navigator.clipboard.writeText(text);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
            }}
        />
    );
}
