/**
 * vrc-photo-metadata.js
 *
 * VRChat 사진(PNG)에서 메타데이터를 추출하는 브라우저용 라이브러리.
 * 외부 의존성 없음. 브라우저 네이티브 API만 사용.
 *
 * Usage:
 *   import { parseVrcPhotoMetadata } from './lib/vrc-photo-metadata.js';
 *   const meta = await parseVrcPhotoMetadata(file);
 *
 * @param {File|ArrayBuffer|Blob} input - PNG 파일
 * @returns {Promise<object>} 메타데이터 객체 또는 에러 객체
 */

// ─── PNG Chunk Parser ──────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * ArrayBuffer에서 PNG 텍스트 청크(tEXt, iTXt)만 추출.
 * IDAT/IEND 등 이미지 데이터는 건너뛰어 대용량 파일도 빠르게 처리.
 */
function parsePngTextChunks(buffer) {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // Signature 검증
  for (let i = 0; i < 8; i++) {
    if (u8[i] !== PNG_SIGNATURE[i]) {
      return { error: 'NOT_PNG' };
    }
  }

  const textChunks = [];
  let offset = 8; // signature 이후

  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) break;

    const length = view.getUint32(offset);
    const typeBytes = u8.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);

    if (type === 'IEND') break;

    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'tEXt' || type === 'iTXt') {
      const data = u8.slice(dataStart, dataEnd);
      textChunks.push({ type, data });
    }

    // 다음 청크: length(4) + type(4) + data(length) + crc(4)
    offset = dataEnd + 4;
  }

  return { chunks: textChunks };
}

// ─── iTXt / tEXt Decoders ──────────────────────────────────────────

const textDecoder = new TextDecoder('utf-8');

/**
 * tEXt 청크 파싱: keyword\0text
 */
function parseTextChunk(data) {
  const nullIdx = data.indexOf(0);
  if (nullIdx === -1) return null;
  const keyword = textDecoder.decode(data.slice(0, nullIdx));
  const text = textDecoder.decode(data.slice(nullIdx + 1));
  return { keyword, text };
}

/**
 * iTXt 청크 파싱:
 *   keyword \0 compressionFlag(1) compressionMethod(1) languageTag \0 translatedKeyword \0 text
 */
function parseItxtChunk(data) {
  const nullIdx = data.indexOf(0);
  if (nullIdx === -1) return null;
  const keyword = textDecoder.decode(data.slice(0, nullIdx));

  // compressionFlag, compressionMethod
  const compressionFlag = data[nullIdx + 1];
  // const compressionMethod = data[nullIdx + 2];

  // languageTag \0
  let pos = nullIdx + 3;
  const langEnd = data.indexOf(0, pos);
  if (langEnd === -1) return null;
  // const languageTag = textDecoder.decode(data.slice(pos, langEnd));

  // translatedKeyword \0
  pos = langEnd + 1;
  const transEnd = data.indexOf(0, pos);
  if (transEnd === -1) return null;
  // const translatedKeyword = textDecoder.decode(data.slice(pos, transEnd));

  pos = transEnd + 1;

  if (compressionFlag === 0) {
    // 비압축
    const text = textDecoder.decode(data.slice(pos));
    return { keyword, text };
  } else {
    // 압축 (deflate) — XMP는 보통 비압축이므로 여기까지 올 일은 드묾
    try {
      const decompressed = new DecompressionStream('deflate');
      // 동기 처리가 어려우므로, 비압축만 지원
      return { keyword, text: '', compressed: true };
    } catch {
      return { keyword, text: '', compressed: true };
    }
  }
}

// ─── XMP Parser ────────────────────────────────────────────────────

/**
 * XMP XML 문자열에서 VRChat 메타데이터 추출.
 * DOMParser로 XML 파싱 후 네임스페이스별 태그 검색.
 */
function parseXmpMetadata(xmpString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmpString, 'application/xml');

  const result = {};

  // 네임스페이스 URI를 모르므로, 태그 이름으로 검색
  // XMP의 rdf:Description 안에 속성 또는 자식 요소로 저장됨
  const descriptions = doc.getElementsByTagName('rdf:Description');

  for (const desc of descriptions) {
    // 속성에서 추출
    for (const attr of desc.attributes) {
      const name = attr.name;
      const value = attr.value;

      if (name === 'xmp:CreatorTool') result.creatorTool = value;
      if (name === 'xmp:Author') result.author = value;
      if (name === 'xmp:CreateDate') result.createDate = value;
      if (name === 'xmp:ModifyDate') result.modifyDate = value;
      if (name === 'tiff:DateTime') result.dateTime = value;
    }

    // 자식 요소에서 추출 (속성이 아닌 경우)
    for (const child of desc.children) {
      const tag = child.localName || child.tagName;
      const ns = child.tagName.split(':')[0];
      const text = child.textContent?.trim();

      if (!text && !child.children.length) continue;

      if (ns === 'xmp') {
        if (tag === 'CreatorTool') result.creatorTool = text;
        if (tag === 'Author') result.author = text;
        if (tag === 'CreateDate') result.createDate = text;
        if (tag === 'ModifyDate') result.modifyDate = text;
      }

      if (ns === 'vrc') {
        if (tag === 'WorldID') result.worldId = text;
        if (tag === 'WorldDisplayName') result.worldName = text;
        if (tag === 'AuthorID') result.authorId = text;
      }

      if (ns === 'dc') {
        if (tag === 'title' || tag === 'Title') {
          // dc:title은 rdf:Alt > rdf:li 구조일 수 있음
          const li = child.getElementsByTagName('rdf:li');
          if (li.length > 0) {
            result.title = li[0].textContent?.trim() || '';
          } else {
            result.title = text;
          }
        }
      }
    }
  }

  return result;
}


// ─── Date Parser ───────────────────────────────────────────────────

/**
 * XMP 날짜 문자열을 ISO 8601로 정규화.
 * 입력: "2026:05:02 00:30:18.9201885+09:00"
 * 출력: "2026-05-02T00:30:18.920+09:00"
 */
function normalizeXmpDate(dateStr) {
  if (!dateStr) return null;
  // "2026:05:02 00:30:18.9201885+09:00" → "2026-05-02T00:30:18.920+09:00"
  return dateStr
    .replace(/^(\d{4}):(\d{2}):(\d{2})\s/, '$1-$2-$3T')
    .replace(/(\.\d{3})\d*/, '$1'); // 밀리초 3자리까지만
}

// ─── Main Export ───────────────────────────────────────────────────

/**
 * VRChat 사진 메타데이터를 추출하여 JS 객체로 반환.
 *
 * @param {File|ArrayBuffer|Blob} input
 * @returns {Promise<object>}
 */
export async function parseVrcPhotoMetadata(input) {
  // input → ArrayBuffer
  let buffer;
  if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (input instanceof Blob || input instanceof File) {
    buffer = await input.arrayBuffer();
  } else {
    return { error: 'INVALID_INPUT', message: 'Expected File, Blob, or ArrayBuffer' };
  }

  // PNG 청크 파싱
  const parseResult = parsePngTextChunks(buffer);
  if (parseResult.error) {
    return { error: parseResult.error };
  }

  const { chunks } = parseResult;

  // 텍스트 청크 디코딩
  let xmpString = null;
  let vrcxJson = null;

  for (const chunk of chunks) {
    let parsed;
    if (chunk.type === 'iTXt') {
      parsed = parseItxtChunk(chunk.data);
    } else if (chunk.type === 'tEXt') {
      parsed = parseTextChunk(chunk.data);
    }

    if (!parsed) continue;

    // XMP: keyword가 "XML:com.adobe.xmp"
    if (parsed.keyword === 'XML:com.adobe.xmp' && parsed.text) {
      xmpString = parsed.text;
    }
  }

  if (!xmpString) {
    return { error: 'NO_METADATA', message: 'No XMP metadata found in PNG' };
  }

  // XMP 파싱
  const xmp = parseXmpMetadata(xmpString);

  if (!xmp.worldId && !xmp.worldName) {
    return { error: 'NOT_VRCHAT_PHOTO', message: 'No VRChat tags found in XMP' };
  }

  // PNG 이미지 크기 (IHDR 청크: offset 8, length는 항상 13)
  const ihdrView = new DataView(buffer, 16, 8); // IHDR data starts at offset 16
  const width = ihdrView.getUint32(0);
  const height = ihdrView.getUint32(4);

  // 결과 객체 구성
  const date = normalizeXmpDate(xmp.createDate);

  return {
    worldName: xmp.worldName || '',
    worldId: xmp.worldId || '',
    author: xmp.author || '',
    authorId: xmp.authorId || '',
    date: date,
    width,
    height,
  };
}
