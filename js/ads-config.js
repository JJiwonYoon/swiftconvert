/**
 * ============================================================================
 * 광고 수익화 설정 파일 (Ad Monetization Configuration)
 * ============================================================================
 * 무료 도메인(*.pages.dev, *.github.io) 단계에서는 카카오 애드핏(AdFit), 쿠팡 파트너스,
 * A-Ads 등을 먼저 활성화하고, 추후 개인 도메인 연결 시 Google AdSense를 켜세요.
 */

window.ADS_CONFIG = {
  // true: 광고 영역에 가이드 플레이스홀더 표시 (개발/검토 모드)
  // false: 아래 입력한 실제 광고 스크립트(애드센스/애드핏/쿠팡 등) 렌더링
  demoMode: true,

  // 1. Google AdSense 설정 (자체 도메인 연결 후 승인 시 입력)
  adsense: {
    enabled: false,
    clientId: "ca-pub-0000000000000000", // 본인 애드센스 게시자 ID
    slots: {
      topLeaderboard: "1111111111",      // 상단 728x90 배너 슬롯 ID
      sidebarRectangle: "2222222222",    // 우측 사이드바 300x250 / 300x600 슬롯 ID
      conversionResult: "3333333333",    // 변환 완료 다운로드 버튼 하단 (CTR 최고 핵심 영역)
      bottomInfeed: "4444444444"         // 하단 가이드 영역 배너
    }
  },

  // 2. 카카오 애드핏 (Kakao AdFit) 설정 - 무료 서브도메인에서도 연동 용이
  kakaoAdFit: {
    enabled: false,
    units: {
      topLeaderboard: "DAN-XXXXXXXXXXXX",   // 728x90 단위 ID
      sidebarRectangle: "DAN-YYYYYYYYYYYY", // 300x250 단위 ID
      conversionResult: "DAN-ZZZZZZZZZZZZ"  // 300x250 단위 ID
    }
  },

  // 3. 쿠팡 파트너스 / 커스텀 제휴 HTML 배너 (공정위 표시광고법에 따라 대가성 문구 반드시 포함)
  customBanners: {
    enabled: false,
    conversionResultHtml: `
      <!-- 여기에 쿠팡 파트너스 다이나믹 배너 iframe 또는 제휴 링크 코드를 붙여넣으세요 -->
      <a href="https://link.coupang.com/" target="_blank" rel="noopener sponsored" style="display:block;padding:12px;background:#fff8f6;border:1px solid #ffd8d6;border-radius:8px;color:#e5322d;font-weight:700;text-align:center;">
        ⚡ 특가 사무용품 / 외장하드 / 태블릿 할인전 보러가기
      </a>
      <p style="margin-top:6px;font-size:0.72rem;color:#64748b;text-align:center;">
        이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    `
  }
};
