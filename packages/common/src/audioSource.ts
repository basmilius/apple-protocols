export interface AudioSource {
    get duration(): number;

    readFrames(count: number): Promise<Buffer | null>;

    reset(): Promise<void>;

    start(): Promise<void>;

    stop(): Promise<void>;
}
