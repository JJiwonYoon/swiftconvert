/**
 * ============================================================================
 * 댓글창 · 개발자 요청서 · 실시간 채팅 연동 설정 (0원 서버리스/무료 SaaS 지원)
 * ============================================================================
 * 기본값("local")은 서버 없이도 브라우저 안에서 즉시 테스트·사용할 수 있습니다.
 * 실제 방문자 모두가 댓글과 개발자 요청서를 공유/수신하려면 아래 무료 서비스 중 하나를 연결하세요.
 *
 * 1) 모든 방문자 공유 댓글창 (무료, 무제한):
 *    - Giscus (https://giscus.app/ko): 공개 GitHub 저장소 Discussions 기반 무료 댓글
 *      commentProvider: "giscus" 로 바꾸고 giscus.repo / repoId / categoryId 입력
 *
 * 2) 개발자 요청서 실제 실시간 수신 (무료 플랜):
 *    - Formspree (https://formspree.io), Google Apps Script 웹앱, Cloudflare Worker, Discord Webhook 등
 *      requestDelivery.endpoint 에 POST URL 입력 시 폼 제출 시 즉시 전송됩니다.
 *    - 또는 githubRepo("아이디/저장소"), contactEmail 입력 시 1클릭 GitHub Issue / 이메일 연동 활성화
 *
 * 3) 운영자 실시간 1:1 채팅 상담 (선택, 무료 플랜):
 *    - Crisp (https://crisp.chat) 또는 Tawk.to (https://www.tawk.to) ID 입력 시 연결 가능
 */

window.FEEDBACK_CONFIG = {
  // "local": 내장 댓글창 (현재 브라우저 저장 + 즉시 테스트 가능)
  // "giscus": GitHub Discussions 기반 실시간 공유 댓글 위젯 임베드
  commentProvider: "local",

  giscus: {
    repo: "",               // 예: "username/swiftconvert-comments"
    repoId: "",             // giscus.app 에서 발급받은 data-repo-id
    category: "Announcements",
    categoryId: "",         // giscus.app 에서 발급받은 data-category-id
    mapping: "pathname",    // 도구 URL(/pdf-to-jpg/, /compress-kb/ 등)별로 스레드 자동 분리
    strict: "0",
    reactionsEnabled: "1",
    emitMetadata: "0",
    inputPosition: "top"
  },

  // 개발자 요청서 전달 채널 (설정 시 즉시 실전 전송 활성화)
  requestDelivery: {
    endpoint: "",           // 예: "https://formspree.io/f/xxxxxxxx" 또는 Google Apps Script / Cloudflare Worker URL
    githubRepo: "",         // 예: "username/swiftconvert" -> "GitHub Issue로 보내기" 버튼 활성화
    contactEmail: ""        // 예: "dev@example.com" -> "이메일로 보내기" 버튼 활성화
  },

  // 선택: 실시간 1:1 운영자 채팅 위젯 (기본 "none"일 때는 내장 스마트 도우미 + 개발자 요청 채팅창 동작)
  liveChat: {
    provider: "none",       // "none" | "crisp" | "tawk"
    crispWebsiteId: "",     // Crisp Website ID
    tawkPropertyId: "",     // Tawk.to Property ID
    tawkWidgetId: "default" // Tawk.to Widget ID
  }
};
