function matches(bytes, offset, expected) {
  return expected.every((byte, index) => bytes[offset + index] === byte)
}

function readAscii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readUint16BigEndian(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint16LittleEndian(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint24LittleEndian(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32BigEndian(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  )
}

function readUint32LittleEndian(bytes, offset) {
  return (
    bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] * 0x1000000)
  )
}

function parsePng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (
    bytes.length < 33
    || !matches(bytes, 0, signature)
    || readUint32BigEndian(bytes, 8) !== 13
    || readAscii(bytes, 12, 4) !== 'IHDR'
    || readAscii(bytes, bytes.length - 8, 4) !== 'IEND'
  ) {
    return null
  }

  return {
    mimeType: 'image/png',
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20),
  }
}

function isJpegStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf)
  )
}

function parseJpeg(bytes) {
  if (
    bytes.length < 12
    || !matches(bytes, 0, [0xff, 0xd8])
    || !matches(bytes, bytes.length - 2, [0xff, 0xd9])
  ) {
    return null
  }

  let offset = 2
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      return null
    }

    while (bytes[offset] === 0xff) {
      offset += 1
    }
    const marker = bytes[offset]
    offset += 1

    if (marker === 0xd9) {
      break
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }
    if (offset + 2 > bytes.length) {
      return null
    }

    const segmentLength = readUint16BigEndian(bytes, offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) {
        return null
      }
      return {
        mimeType: 'image/jpeg',
        width: readUint16BigEndian(bytes, offset + 5),
        height: readUint16BigEndian(bytes, offset + 3),
      }
    }

    if (marker === 0xda) {
      return null
    }
    offset += segmentLength
  }

  return null
}

function parseWebpDimensions(bytes, chunkType, dataOffset, chunkSize) {
  if (chunkType === 'VP8X' && chunkSize >= 10) {
    return {
      width: readUint24LittleEndian(bytes, dataOffset + 4) + 1,
      height: readUint24LittleEndian(bytes, dataOffset + 7) + 1,
    }
  }

  if (chunkType === 'VP8L' && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
    const dimensions = readUint32LittleEndian(bytes, dataOffset + 1)
    return {
      width: (dimensions & 0x3fff) + 1,
      height: ((dimensions >>> 14) & 0x3fff) + 1,
    }
  }

  if (
    chunkType === 'VP8 '
    && chunkSize >= 10
    && matches(bytes, dataOffset + 3, [0x9d, 0x01, 0x2a])
  ) {
    return {
      width: readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
      height: readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
    }
  }

  return null
}

function parseWebp(bytes) {
  if (
    bytes.length < 30
    || readAscii(bytes, 0, 4) !== 'RIFF'
    || readAscii(bytes, 8, 4) !== 'WEBP'
    || readUint32LittleEndian(bytes, 4) + 8 !== bytes.length
  ) {
    return null
  }

  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4)
    const chunkSize = readUint32LittleEndian(bytes, offset + 4)
    const dataOffset = offset + 8
    const nextOffset = dataOffset + chunkSize + (chunkSize % 2)
    if (nextOffset > bytes.length) {
      return null
    }

    const dimensions = parseWebpDimensions(bytes, chunkType, dataOffset, chunkSize)
    if (dimensions) {
      return { mimeType: 'image/webp', ...dimensions }
    }
    offset = nextOffset
  }

  return null
}

export async function inspectImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const metadata = parsePng(bytes) || parseJpeg(bytes) || parseWebp(bytes)

  if (!metadata || metadata.width < 1 || metadata.height < 1) {
    throw new Error('Image content is not a valid PNG, JPEG, or WebP file')
  }

  if (metadata.mimeType !== file.type) {
    throw new Error(`Image content does not match the declared MIME type ${file.type}`)
  }

  return { ...metadata, bytes }
}
