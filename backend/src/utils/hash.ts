import crypto from 'crypto';

// Recursively sorts object keys before serializing, so two payloads with identical data but different
// field order still hash identically; without this, a legitimate retry can be misidentified as a payload
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>).sort();
        const entries = keys.map(
            (key) => `"${key}":${stableStringify((value as Record<string, unknown>)[key])}`
        );
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

export function hashPayload(payload: unknown): string {
    return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}
