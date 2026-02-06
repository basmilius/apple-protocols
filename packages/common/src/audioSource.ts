export abstract class AudioSource {
    abstract get duration(): number;

    abstract readframes(count: number): Promise<Buffer | null>;

    abstract reset(): Promise<void>;

    abstract start(): Promise<void>;

    abstract stop(): Promise<void>;
}
