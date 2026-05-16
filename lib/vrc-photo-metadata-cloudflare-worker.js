export default {
    async fetch(request, env, ctx) {
        // 1. 브라우저의 사전 요청(Preflight, OPTIONS 메서드) 처리
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            });
        }

        // 2. 요청 URL에서 worldId 파라미터 추출
        const url = new URL(request.url);
        const worldId = url.searchParams.get("worldId");

        if (!worldId) {
            return new Response("worldId 파라미터가 누락되었습니다.", { status: 400 });
        }

        // 3. VRChat API 타겟 URL 생성
        const targetUrl = `https://api.vrchat.cloud/api/1/worlds/${worldId}`;

        try {
            // 4. VRChat 서버로 데이터 요청
            const response = await fetch(targetUrl, {
                method: "GET",
                headers: {
                    // VRChat API 정책 준수를 위해 앱을 식별할 수 있는 User-Agent를 넣는 것이 좋습니다.
                    "User-Agent": "vrc-printf-photo-metadata/1.0 (Contact: qnfkdbs0222@naver.com)"
                }
            });

            // 5. VRChat의 응답을 복사하여 CORS 허용 헤더 추가
            const newResponse = new Response(response.body, response);
            newResponse.headers.set("Access-Control-Allow-Origin", "*");

            return newResponse;

        } catch (error) {
            return new Response("API 요청 중 오류가 발생했습니다.", { status: 500 });
        }
    }
};
