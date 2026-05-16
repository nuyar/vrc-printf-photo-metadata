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

function getCacheKey(worldId) {
  return `world::${worldId}`;
}

// ── 2. Fetcher Registry ──
// 글로벌에 위치하는 공용 Fetcher 저장소 (우선순위 순서대로 등록됨)
export const fetcherRegistry = [];
export let currentFetcherIndex = 0;

/**
 * 새로운 Fetcher를 등록합니다. 먼저 등록된 Fetcher가 높은 우선순위를 가집니다.
 * @param {Function} fetchFn - worldId를 인자로 받는 함수
 * @returns {number} 등록된 Fetcher의 인덱스
 */
export function registerFetcher(fetchFn) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn must be a function');
  }
  fetcherRegistry.push(fetchFn);
  return fetcherRegistry.length - 1;
}

/**
 * 현재 Fetcher에 문제가 발생했을 때 다음 우선순위의 Fetcher로 전환합니다.
 */
export function useNextFetcher() {
  currentFetcherIndex++;
}

// ── 3. Framework Main API ──

/**
 * World 정보를 가져옵니다. (캐시 우선 확인, 에러 시 Fallback 수행)
 * @param {string} worldId - 월드 ID
 * @returns {Promise<Object>} 월드 정보 객체
 */
export async function fetchWorld(worldId) {
  const cacheKey = getCacheKey(worldId);

  // DB(캐시)에 정보가 있는지 확인
  if (WorldDB.hasInfo(cacheKey)) {
    console.debug(`[World Fetcher] Cache hit for ${worldId}`);
    return WorldDB.getInfo(cacheKey);
  }

  // 등록된 Fetcher를 우선순위대로 시도
  while (currentFetcherIndex < fetcherRegistry.length) {
    const fetchFn = fetcherRegistry[currentFetcherIndex];
    console.debug(`[World Fetcher] Trying fetcher index ${currentFetcherIndex} for ${worldId}`);

    try {
      const worldInfo = await fetchFn(worldId);
      
      // 검증 로직: authorId나 authorName이 없으면 에러 발생
      if (!worldInfo || !worldInfo.authorId || !worldInfo.authorName) {
        console.error(`[World Fetcher] Validation failed. Received data:`, worldInfo);
        throw new Error('Invalid response: Missing authorId or authorName');
      }

      // DB에 결과 저장
      WorldDB.putInfo(cacheKey, worldInfo);
      return worldInfo;
    } catch (error) {
      console.warn(`[World Fetcher] Fetcher at index ${currentFetcherIndex} failed.`);
      console.error(error); // 자세한 에러 스택/정보 로깅
      useNextFetcher(); // 에러 발생 시 다음 Fetcher로 설정
    }
  }

  // 모든 Fetcher가 실패했거나 다 소진된 경우
  throw new Error(`[World Fetcher] All fetchers failed for worldId: ${worldId}`);
}

// ── 4. Built-in Fetchers ──

// 우선순위 1: corsproxy.io Fetcher
registerFetcher(async (worldId) => {
  const targetUrl = `https://api.vrchat.cloud/api/1/worlds/${worldId}`;
  const url = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  console.log(`[World Fetcher] Requesting via corsproxy.io: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No response body');
    throw new Error(`corsproxy.io HTTP error: ${response.status}\nBody: ${errorBody}`);
  }
  return await response.json();
});

// 우선순위 2: puter.js Fetcher
registerFetcher(async (worldId) => {
  const url = `https://api.vrchat.cloud/api/1/worlds/${worldId}`;
  console.log(`[World Fetcher] Requesting via puter.js: ${url}`);
  
  if (typeof puter === 'undefined') {
    throw new Error('puter is not defined. Make sure puter.js is loaded in HTML.');
  }
  
  const response = await puter.net.fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No response body');
    throw new Error(`puter.js HTTP error: ${response.status}\nBody: ${errorBody}`);
  }
  return await response.json();
});

// 우선순위 3: 개발해주신 Nuyar Worker Fetcher
registerFetcher(async (worldId) => {
  const url = `https://vrc-fetch-info.worker.nuyar.kr/?worldId=${encodeURIComponent(worldId)}`;
  console.log(`[World Fetcher] Requesting via Nuyar worker: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No response body');
    throw new Error(`Worker HTTP error: ${response.status} ${response.statusText}\nBody: ${errorBody}`);
  }
  return await response.json();
});
