# LeafConvert — 서버/도메인 비용 0원 다국어 PDF·이미지 변환기 (15종 + SEO 전용 랜딩 페이지)

iLovePDF 스타일의 **100% 브라우저(Client-Side) 파일 변환 웹사이트**입니다.
파일을 외부 서버로 전송하지 않고 사용자 브라우저 안에서 직접 변환하므로 **서버 유지비 0원**, **개인정보 유출 위험 0%**로 운영할 수 있습니다.

## 주요 기능 (15종 변환기 + 4개국어 지원 + SEO 구조화)
- **다국어(i18n) 지원**: 한국어(`ko`), 영어(`en`), 일본어(`ja`), 스페인어(`es`) 자동 감지 및 실시간 전환
- **실시간 도구 검색**: 메인 검색창에서 키워드(예: `200KB`, `워터마크`, `HEIC`, `이어붙이기`)로 즉시 검색
- **PDF 도구 9종**:
  1. `pdf-to-jpg`: PDF 각 페이지를 고화질 JPG로 변환 + 일괄 ZIP 다운로드
  2. `jpg-to-pdf`: 여러 JPG/PNG/WebP 이미지를 순서대로 단일 PDF로 병합
  3. `merge-pdf`: 여러 PDF 파일을 원하는 순서로 병합
  4. `split-pdf`: 전체 페이지 개별 PDF 분할(ZIP) 또는 특정 페이지 범위 추출 (`1-3, 5`)
  5. `organize-pdf`: 시각적 페이지 썸네일 미리보기 + 특정 페이지 삭제·순서 변경·개별 회전
  6. `rotate-pdf`: PDF 전체 페이지 90° / 180° / 270° 회전
  7. `watermark-pdf`: 한글/영문 워터마크 삽입 (대각선 중앙 / 바둑판 전체 / 우측 하단)
  8. `page-numbers-pdf`: PDF 페이지 번호 삽입 (`1 / 10`, `1`, `- 1 -`, `Page 1`)
  9. `pdf-to-png`: 텍스트 깨짐 없는 무손실 PNG 변환
- **이미지 도구 6종**:
  10. `compress-image`: 이미지 화질 조절을 통한 파일 용량 압축
  11. `compress-kb`: 원서/이력서/관공서 제출용 **목표 용량(100KB / 200KB / 500KB 이하)** 자동 맞춤 압축
  12. `webp-to-jpg`: WebP / PNG / SVG / GIF ↔ JPG / PNG / WebP 포맷 변환
  13. `heic-to-jpg`: 아이폰 HEIC/HEIF 사진을 일반 JPG/PNG로 변환
  14. `resize-image`: 가로 픽셀(px) 및 증명·SNS 프리셋 일괄 리사이즈
  15. `stitch-images`: 스크린샷·카톡 캡처·영수증을 세로 또는 가로 1장의 이미지로 이어붙이기

## 무료 도메인·호스팅(0원) 배포 및 검색(SEO) 등록 방법

### 1. 본인 배포 주소로 SEO 페이지/사이트맵 일괄 갱신
Cloudflare Pages에서 발급받은 주소(`https://leafconvert.pages.dev`)가 정해지면 아래 명령어 한 줄로 `sitemap.xml`, `robots.txt`, 15개 개별 도구 HTML의 `canonical` 및 구조화 데이터를 한 번에 갱신할 수 있습니다:
```bash
python3 scripts/build_seo_pages.py --domain https://leafconvert.pages.dev
```

### 2. Cloudflare Pages 무료 배포 (상업적 광고 허용 + 트래픽 무제한)
1. [Cloudflare Pages](https://pages.cloudflare.com/)에 로그인 후 **Workers & Pages → Create → Pages → Upload assets**를 선택합니다.
2. 이 프로젝트 폴더 전체(`index.html`, `css/`, `js/`, `15개 도구 폴더/`, `robots.txt`, `sitemap.xml`)를 업로드합니다.
3. 배포 후 **Google Search Console**과 **네이버 서치어드바이저**에 사이트를 등록하고 `sitemap.xml`을 제출하세요.

### 3. 광고 수익화 설정 (`js/ads-config.js`)
- **무료 `*.pages.dev` 도메인 단계**: `js/ads-config.js`에서 `demoMode: false`로 바꾸고 `kakaoAdFit` 또는 `customBanners`(쿠팡 파트너스 등)를 먼저 연결하세요.
- **자체 `.com` 도메인 연결 후**: `adsense.enabled = true` 설정 및 `index.html` / 각 도구 페이지의 애드센스 스크립트를 활성화하세요.

### 4. 댓글창 · 개발자 요청서 · 채팅창 연동 (`js/feedback-config.js`, `functions/api/`)
- **로그인 없는 익명 공유 댓글창 (`commentProvider: "api"`, 권장 · 0원)**: Cloudflare Pages 프로젝트 **Settings → Bindings(또는 Functions)** 에서 무료 D1 데이터베이스를 변수명 **`DB`** 로 연결하면, 방문자가 로그인 없이 남긴 댓글·대댓글·좋아요가 [functions/api/comments.js](functions/api/comments.js) 를 통해 D1에 저장되어 모든 방문자에게 실시간 공유됩니다. (`DB` 미연결/로컬 환경에서는 자동으로 브라우저 저장 모드로 동작합니다.)
- **Giscus 공유 댓글창(선택)**: `commentProvider: "giscus"` + `giscus.app/ko`에서 발급받은 `repo`, `repoId`, `categoryId` 입력
- **개발자 요청서 실시간 Telegram 알림 (`/api/requests`)**: [functions/api/requests.js](functions/api/requests.js) 가 연결되어 있습니다. Cloudflare Pages 프로젝트 **Settings → Variables and Secrets** 에 `TELEGRAM_BOT_TOKEN` 과 `TELEGRAM_CHAT_ID` 를 시크릿으로 등록하면 요청서 제출 즉시 텔레그램 푸시 알림과 D1 백업 저장이 함께 동작합니다. (`githubRepo` / `contactEmail` 기반 1클릭 Issue/이메일 전송도 병행 지원)
- **실시간 1:1 운영자 채팅(선택)**: `liveChat`에 Crisp 또는 Tawk.to ID 연결

## 로컬 테스트 방법
```bash
cd /home/dev/Downloads/givememoney && python3 -m http.server 8080 --bind 127.0.0.1
```
브라우저에서 `http://localhost:8080` 접속
