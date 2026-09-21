import { Component, type ErrorInfo, type ReactNode } from 'react';
import clsx from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { Icon } from './Icon';

type ErrorBoundaryProps = {
    /* What failed, as the first line of the message: "This panel failed to render". */
    readonly label: string;
    /* What the children draw from; the boundary tries again when one of them changes. */
    readonly resetKeys?: readonly unknown[];
    readonly compact?: boolean;
    readonly className?: string;
    readonly children: ReactNode;
};

type ErrorBoundaryState = {
    error: unknown;
    failed: boolean;
};

const CLEAR: ErrorBoundaryState = {error: null, failed: false};

/*
 * Keeps a render failure to the cell it happened in. Without one React unmounts the whole tree, and
 * one broken panel would take the grid, the sidebar and the log console with it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = CLEAR;

    static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
        return {error, failed: true};
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        console.error(`${this.props.label}:`, error, info.componentStack);
    }

    componentDidUpdate(previous: ErrorBoundaryProps): void {
        const before = previous.resetKeys ?? [];
        const now = this.props.resetKeys ?? [];

        if (this.state.failed && (before.length !== now.length || now.some((key, index) => key !== before[index]))) {
            this.reset();
        }
    }

    reset(): void {
        this.setState(CLEAR);
    }

    render(): ReactNode {
        if (!this.state.failed) {
            return this.props.children;
        }

        const {label, compact = false, className = 'absolute inset-0'} = this.props;
        const {error} = this.state;

        return (
            <div role="alert" className={clsx('grid place-items-center overflow-auto bg-surface', compact ? 'p-3' : 'p-6', className)}>
                <div className={clsx('flex max-w-[360px] flex-col items-center text-center', compact ? 'gap-1' : 'gap-2')}>
                    {!compact && <Icon icon={TriangleAlert} size={20} className="text-status-error"/>}
                    <p className="text-sm font-medium text-text">{label}</p>
                    <p className="line-clamp-4 text-xs break-words text-text-muted">{error instanceof Error ? error.message : String(error)}</p>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={() => this.reset()}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }
}
