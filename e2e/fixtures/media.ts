/**
 * Synthetic media files for the native media tests: a PNG image and a WAV sound, each written from known values so a
 * test can check what the browser decoded.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import zlib from 'zlib'

/** Table for the CRC-32 every PNG chunk ends with. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    return c >>> 0
})

const crc32 = (bytes: Buffer) => {
    let c = 0xFFFFFFFF
    for (const byte of bytes) {
        c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}

const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
}

/**
 * An RGB PNG of the given size, a horizontal gradient from black to red.
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 */
export const writePng = (width: number, height: number) => {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    // Bit depth 8, colour type 2 (RGB), default compression, filter and interlace.
    header.set([8, 2, 0, 0, 0], 8)
    const rows = Buffer.alloc(height * (1 + width * 3))
    for (let y = 0; y < height; y++) {
        const row = y * (1 + width * 3)
        // Filter type 0 (none) leads every row.
        rows[row] = 0
        for (let x = 0; x < width; x++) {
            rows[row + 1 + x * 3] = Math.round(255 * x / Math.max(1, width - 1))
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(rows)),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

/**
 * A mono 16-bit PCM WAV holding a 440 Hz sine.
 * @param seconds - Duration in seconds.
 * @param rate - Sampling rate in Hz.
 */
export const writeWav = (seconds: number, rate = 8000) => {
    const samples = Math.round(seconds * rate)
    const data = Buffer.alloc(samples * 2)
    for (let i = 0; i < samples; i++) {
        data.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * 440 * i / rate)), i * 2)
    }
    const header = Buffer.alloc(44)
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(36 + data.length, 4)
    header.write('WAVE', 8, 'ascii')
    header.write('fmt ', 12, 'ascii')
    header.writeUInt32LE(16, 16)
    // PCM, one channel.
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(rate, 24)
    header.writeUInt32LE(rate * 2, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36, 'ascii')
    header.writeUInt32LE(data.length, 40)
    return Buffer.concat([header, data])
}
