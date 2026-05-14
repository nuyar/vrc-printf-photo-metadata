/**
 * VRChat World Info Fetch Framework
 */

// ── 1. Local DB (Cache) ──
// Map 객체를 기반으로 동작하는 단순한 DB 인터페이스
const localWorldDB = new Map();

export const WorldDB = {
  hasInfo: (key) => localWorldDB.has(key),
  getInfo: (key) => localWorldDB.get(key),
  putInfo: (key, value) => localWorldDB.set(key, value),
  clear: () => localWorldDB.clear()
};

function getCacheKey(worldId, source) {
  return `${source}::${worldId}`;
}

// ── 2. Fetcher Registry ──
// 글로벌에 위치하는 공용 Fetcher 저장소
export const fetcherRegistry = new Map();

/**
 * 새로운 Fetcher를 등록합니다.
 * @param {string} source - 식별자 (예: 'nuyar-vrc-fetch-info')
 * @param {Function} fetchFn - worldId를 인자로 받는 함수
 */
export function registerFetcher(source, fetchFn) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn must be a function');
  }
  fetcherRegistry.set(source, fetchFn);
}

// ── 3. Framework Main API ──

/**
 * World 정보를 가져옵니다. (캐시 우선 확인)
 * @param {string} worldId - 월드 ID
 * @param {string} source - 사용할 Fetcher 이름
 * @returns {Promise<Object>} 월드 정보 객체
 */
export async function fetchWorld(worldId, source = "nuyar-vrc-fetch-info") {
  const cacheKey = getCacheKey(worldId, source);

  // DB(캐시)에 정보가 있는지 확인
  if (WorldDB.hasInfo(cacheKey)) {
    console.debug(`[World Fetcher] Cache hit for ${worldId} (${source})`);
    return WorldDB.getInfo(cacheKey);
  }

  // Fetcher 조회
  const fetchFn = fetcherRegistry.get(source);
  if (!fetchFn) {
    throw new Error(`[World Fetcher] Unregistered source: ${source}`);
  }

  // Fetcher 실행
  try {
    const worldInfo = await fetchFn(worldId);
    
    // DB에 결과 저장
    WorldDB.putInfo(cacheKey, worldInfo);
    
    return worldInfo;
  } catch (error) {
    console.error(`[World Fetcher] Failed to fetch ${worldId} via ${source}`, error);
    throw error;
  }
}

// ── 4. Built-in Fetchers ──

// 개발해주신 Worker를 사용하는 Fetcher 등록
registerFetcher('nuyar-vrc-fetch-info', async (worldId) => {
  const url = `https://vrc-fetch-info.worker.nuyar.kr/?worldId=${encodeURIComponent(worldId)}`;
  console.log(`[World Fetcher] Requesting API: ${url}`);
  const response = await fetch(url);
  console.log(`[World Fetcher] Response status: ${response.status}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from worker: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`[World Fetcher] Fetched data:`, data);
  return data;
});
