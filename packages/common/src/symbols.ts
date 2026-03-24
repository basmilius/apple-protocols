/**
 * Unique symbol used as a key for accessing encryption state on connection instances.
 * Provides type-safe access to internal encryption fields without exposing them publicly.
 */
export const ENCRYPTION: unique symbol = Symbol();
