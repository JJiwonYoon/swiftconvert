/**
 * ============================================================================
 * LeafConvert 댓글창 · 개발자 요청서 · 실시간 채팅 도우미 모듈
 * - 다국어(ko / en / ja / es) 및 다크/라이트 테마 완벽 동기화
 * - 정적 호스팅 호환 (로컬 저장 + Giscus/Webhook/GitHub/이메일/Crisp/Tawk 옵션 연동)
 * ============================================================================
 */
(function () {
  const STORAGE_KEYS = {
    comments: "leafconvert_comments_v1",
    likes: "leafconvert_comment_likes_v1",
    requests: "leafconvert_requests_v1",
    chat: "leafconvert_chat_history_v1",
    nick: "leafconvert_comment_nick_v1",
    token: "leafconvert_user_token_v1"
  };

  const VALID_ID_RE = /^[a-z0-9-]+$/i;

  const FEEDBACK_I18N = {
    ko: {
      navFeedbackBtn: "💬 댓글·요청",
      sectionTitle: "💬 방문자 댓글창 & 개발자 요청서",
      sectionSubtitle: "사용 후기, 궁금한 점, 필요한 새 변환 기능이나 오류를 자유롭게 남겨주세요.",
      tabComments: "💬 댓글창",
      tabRequest: "🛠️ 개발자 요청서",
      localModeBadge: "💬 내 브라우저 저장",
      localModeDesc: "작성하신 댓글과 기능 요청은 현재 기기의 브라우저에 안전하게 저장됩니다.",
      sharedModeBadge: "💬 로그인 없는 익명 공유 댓글",
      sharedModeDesc: "회원가입·로그인 없이 자유롭게 후기나 의견을 남기면 모든 방문자와 실시간으로 공유됩니다.",
      giscusModeBadge: "💬 실시간 공유 댓글",
      giscusModeDesc: "모든 방문자와 댓글·반응을 실시간으로 함께 공유할 수 있습니다.",
      nickLabel: "닉네임",
      nickPlaceholder: "익명 (선택)",
      commentTypeLabel: "말머리",
      typePraise: "👍 추천/후기",
      typeFeature: "✨ 기능 제안",
      typeBug: "🐛 버그/오류",
      typeQuestion: "💬 질문/의견",
      scopeLabel: "관련 도구",
      scopeAll: "전체 사이트 공통",
      commentPlaceholder: "변환기 사용 소감이나 '이런 기능 만들어주세요!' 같은 의견을 편하게 남겨주세요. (Ctrl+Enter 등록)",
      commentSubmitBtn: "댓글 등록하기",
      filterAll: "전체 댓글",
      filterCurrent: "현재 도구만",
      sortNewest: "최신순",
      sortTop: "추천순",
      emptyCommentsTitle: "아직 등록된 댓글이 없습니다",
      emptyCommentsDesc: "첫 번째 댓글을 남겨보세요! 아래 버튼을 누르면 예시 문장이 바로 입력됩니다.",
      starterPraise: "👍 후기 남기기",
      starterFeature: "✨ 새 기능 요청하기",
      starterBug: "🐛 오류 제보하기",
      starterPraiseText: "설치 없이 브라우저에서 바로 변환되고 서버에 파일이 안 올라가서 안심하고 썼어요!",
      starterFeatureText: "개발자님, 다음 업데이트 때 [원하는 파일 형식/기능] 변환 기능도 추가해 주실 수 있나요?",
      starterBugText: "[도구 이름] 사용 중에 특정 파일에서 오류가 발생합니다. 확인 부탁드려요!",
      replyBtn: "답글",
      replyPlaceholder: "답글 내용을 입력하세요...",
      replySubmitBtn: "답글 등록",
      deleteBtn: "삭제",
      helpfulBtn: "공감",
      anonymousName: "익명",
      justNow: "방금 전",
      minsAgo: "분 전",
      hoursAgo: "시간 전",
      daysAgo: "일 전",
      reqIntroTitle: "개발자에게 새 기능 · 오류 수정 요청하기",
      reqIntroDesc: "원하시는 변환 도구나 불편한 점을 적어주시면 우선순위를 반영해 빠르게 검토·업데이트합니다.",
      reqCatLabel: "요청 구분",
      reqCatNewTool: "✨ 새 변환 도구 추가",
      reqCatImprove: "⚙️ 기존 기능 개선",
      reqCatBug: "🐛 오류·버그 신고",
      reqCatUi: "🎨 디자인·사용성 건의",
      reqPriorityLabel: "필요도",
      reqPriNormal: "보통 (있으면 좋겠음)",
      reqPriHigh: "높음 (자주 필요함)",
      reqPriUrgent: "긴급 (변환이 안 됨)",
      reqToolLabel: "관련 도구",
      reqToolNewProposal: "신규 도구 제안 / 사이트 전체",
      reqTitleLabel: "요청 제목 *",
      reqTitlePlaceholder: "예: AVIF 이미지 → JPG 변환 추가 또는 PDF 여백 일괄 조정 요청",
      reqDetailsLabel: "상세 설명 *",
      reqDetailsPlaceholder: "어떤 파일 형식과 옵션이 필요한지, 오류가 났다면 어떤 상황이었는지 자세히 적어주세요.",
      reqContactLabel: "회신 받을 연락처 (선택)",
      reqContactPlaceholder: "이메일 또는 닉네임 (선택 사항)",
      reqAttachEnvLabel: "현재 페이지 URL · 브라우저 · 화면 크기 정보 함께 첨부하기",
      reqCrossPostLabel: "아래 댓글창에도 함께 공개 등록해서 다른 사용자 공감(👍) 받기",
      reqSubmitBtn: "📩 개발자 요청서 제출하기",
      reqSubmitting: "전송 중...",
      reqListTitle: "내가 작성한 개발자 요청서 내역",
      reqEmptyDesc: "아직 제출한 요청서가 없습니다. 위 양식을 작성해 필요한 기능을 알려주세요!",
      reqStatusSent: "개발자 전송 완료 ✅",
      reqStatusLocal: "접수 완료 · 복사/직접 전달 가능 📋",
      reqCopyBtn: "📋 요청서 복사",
      reqGithubBtn: "🐙 GitHub Issue로 보내기",
      reqEmailBtn: "✉️ 이메일로 보내기",
      reqValidationError: "요청 제목과 상세 설명을 모두 입력해주세요.",
      reqSubmittedSent: "✅ 개발자 요청서가 성공적으로 전송되었습니다!",
      reqSubmittedLocal: "📋 요청서가 저장되었습니다! 아래 복사·전달 버튼을 통해 바로 전달하실 수 있습니다.",
      reqTicketCopied: "✅ 요청서 양식이 클립보드에 복사되었습니다!",
      toastCommentPosted: "✅ 댓글이 등록되었습니다!",
      toastCommentDeleted: "🗑️ 삭제되었습니다.",
      toastReplyPosted: "✅ 답글이 등록되었습니다!",
      toastCommentValidation: "댓글 내용을 입력해주세요.",
      toastCommentRateLimit: "⏳ 잠시 후(약 5초) 다시 작성해 주세요.",
      toastCommentError: "⚠️ 댓글 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      chatFabLabel: "채팅 · 개발자 요청",
      chatTitle: "LeafConvert 도우미",
      chatSubtitle: "도구 찾기 · 사용법 · 개발자 기능 요청",
      chatOpenReqBtn: "📋 요청서",
      chatClearBtn: "초기화",
      chatInputPlaceholder: "궁금한 변환 기능이나 요청사항을 입력하세요...",
      chatSendBtn: "전송",
      chatWelcome: "안녕하세요! 필요한 PDF·이미지 변환 도구를 찾아드리거나, 없는 기능은 바로 '개발자 요청서'로 접수해 드립니다.",
      chatChipReq: "🛠️ 개발자 요청서 작성",
      chatChipComments: "💬 댓글창 보기",
      chatChipKb: "🎯 200KB 압축 방법",
      chatChipPrivacy: "🔒 서버 전송/보안 안내",
      chatChipHeic: "📱 아이폰 HEIC 변환",
      chatBackToChat: "← 대화로 돌아가기",
      chatInlineReqTitle: "🛠️ 빠른 개발자 요청서 작성",
      chatInlineSentMsg: "접수가 완료되었습니다! 아래 '개발자 요청서' 탭에서도 내역을 확인하거나 복사하실 수 있습니다.",
      chatSendAsReqBtn: "🛠️ 이 내용으로 개발자 요청서 작성",
      chatGoCommentsBtn: "💬 댓글창으로 이동",
      chatToolMatchPrefix: "찾으시는 작업에 딱 맞는 도구를 발견했어요! 아래 버튼을 누르면 바로 열립니다:",
      chatNoMatchText: "현재 15종 도구 목록에서는 정확한 일치 항목을 찾지 못했습니다. 원하시는 새 기능이나 오류 문의라면 바로 개발자 요청서로 남겨주시겠어요?",
      chatPrivacyReply: "LeafConvert의 모든 변환은 외부 서버로 파일을 보내지 않고 고객님의 브라우저 메모리 안에서만 100% 처리됩니다. 따라서 보안·유출 걱정 없이 안전하게 무료로 이용하실 수 있습니다.",
      chatKbReply: "이력서·관공서용 100KB / 200KB / 500KB 이하 압축은 [목표 용량(KB) 딱 맞춰 압축] 도구에서 클릭 한 번으로 자동 맞춤할 수 있습니다.",
      chatHeicReply: "아이폰 사진(.HEIC/.HEIF)을 윈도우나 웹사이트 업로드용 JPG/PNG로 바꾸려면 [HEIC 사진 JPG 변환] 도구를 사용하세요.",
      chatLiveAgentBtn: "🧑‍💻 실시간 상담 위젯 열기",
      chatEndpointFailed: "⚠️ 외부 전송 중 오류가 발생해 로컬 내역에 안전하게 보관했습니다. '요청서 복사' 버튼으로 전달하실 수 있습니다."
    },
    en: {
      navFeedbackBtn: "💬 Feedback",
      sectionTitle: "💬 Community Comments & Developer Requests",
      sectionSubtitle: "Share feedback, ask questions, or request new converters and bug fixes directly.",
      tabComments: "💬 Comments",
      tabRequest: "🛠️ Feature Request",
      localModeBadge: "💬 Saved in Your Browser",
      localModeDesc: "Comments and feature requests are stored safely in your browser on this device.",
      sharedModeBadge: "💬 Anonymous Shared Comments",
      sharedModeDesc: "Post reviews or feedback freely without signing in — shared live with all visitors.",
      giscusModeBadge: "💬 Live Community Comments",
      giscusModeDesc: "Share comments and reactions live with other visitors.",
      nickLabel: "Nickname",
      nickPlaceholder: "Guest (optional)",
      commentTypeLabel: "Tag",
      typePraise: "👍 Review",
      typeFeature: "✨ Feature Idea",
      typeBug: "🐛 Bug Report",
      typeQuestion: "💬 Question",
      scopeLabel: "Related Tool",
      scopeAll: "General / All Tools",
      commentPlaceholder: "Leave feedback or tell the developer what converter you want next... (Ctrl+Enter to post)",
      commentSubmitBtn: "Post Comment",
      filterAll: "All Comments",
      filterCurrent: "This Tool Only",
      sortNewest: "Newest",
      sortTop: "Most Helpful",
      emptyCommentsTitle: "No comments yet",
      emptyCommentsDesc: "Be the first to share a note or request! Click a quick starter below to draft one.",
      starterPraise: "👍 Leave a Review",
      starterFeature: "✨ Request a Tool",
      starterBug: "🐛 Report a Bug",
      starterPraiseText: "Love that everything converts right in my browser with zero file uploads!",
      starterFeatureText: "Hi developer! Could you add a converter for [format or feature] in a future update?",
      starterBugText: "I ran into an issue while using [Tool Name]. Here are the details:",
      replyBtn: "Reply",
      replyPlaceholder: "Write a reply...",
      replySubmitBtn: "Post Reply",
      deleteBtn: "Delete",
      helpfulBtn: "Helpful",
      anonymousName: "Guest",
      justNow: "Just now",
      minsAgo: "m ago",
      hoursAgo: "h ago",
      daysAgo: "d ago",
      reqIntroTitle: "Submit a Developer Feature Request / Bug Ticket",
      reqIntroDesc: "Tell us what new format, option, or fix you need so we can prioritize it.",
      reqCatLabel: "Request Type",
      reqCatNewTool: "✨ New Converter Tool",
      reqCatImprove: "⚙️ Improve Existing Tool",
      reqCatBug: "🐛 Bug Report",
      reqCatUi: "🎨 UI / UX Suggestion",
      reqPriorityLabel: "Priority",
      reqPriNormal: "Normal (Nice to have)",
      reqPriHigh: "High (Need often)",
      reqPriUrgent: "Urgent (Blocking workflow)",
      reqToolLabel: "Related Tool",
      reqToolNewProposal: "New Tool Proposal / Site-Wide",
      reqTitleLabel: "Request Title *",
      reqTitlePlaceholder: "e.g., Add AVIF to JPG converter or batch PDF margin adjustment",
      reqDetailsLabel: "Details *",
      reqDetailsPlaceholder: "Describe the file formats, desired options, or steps to reproduce an issue.",
      reqContactLabel: "Reply Contact (optional)",
      reqContactPlaceholder: "Email or handle (optional)",
      reqAttachEnvLabel: "Include current page URL, browser, and viewport size",
      reqCrossPostLabel: "Also post publicly to the Comments tab so others can upvote (👍)",
      reqSubmitBtn: "📩 Submit Developer Request",
      reqSubmitting: "Sending...",
      reqListTitle: "Your Submitted Requests",
      reqEmptyDesc: "No feature requests submitted yet. Use the form above to send one!",
      reqStatusSent: "Delivered to Developer ✅",
      reqStatusLocal: "Saved · Ready to Copy/Send 📋",
      reqCopyBtn: "📋 Copy Request",
      reqGithubBtn: "🐙 Open GitHub Issue",
      reqEmailBtn: "✉️ Send via Email",
      reqValidationError: "Please fill in both the request title and details.",
      reqSubmittedSent: "✅ Your developer request has been delivered!",
      reqSubmittedLocal: "📋 Request saved! Use the Copy, GitHub, or Email actions below to send it.",
      reqTicketCopied: "✅ Formatted request copied to clipboard!",
      toastCommentPosted: "✅ Comment posted!",
      toastCommentDeleted: "🗑️ Deleted.",
      toastReplyPosted: "✅ Reply posted!",
      toastCommentValidation: "Please write a comment before posting.",
      toastCommentRateLimit: "⏳ Please wait a few seconds before posting again.",
      toastCommentError: "⚠️ Could not save your action right now. Please try again.",
      chatFabLabel: "Chat · Request",
      chatTitle: "LeafConvert Assistant",
      chatSubtitle: "Find tools · Help · Developer Request",
      chatOpenReqBtn: "📋 Request",
      chatClearBtn: "Reset",
      chatInputPlaceholder: "Ask how to convert a file or request a feature...",
      chatSendBtn: "Send",
      chatWelcome: "Hi! Tell me what file you need to convert, or click Request to send a feature idea straight to the developer.",
      chatChipReq: "🛠️ Send Feature Request",
      chatChipComments: "💬 Jump to Comments",
      chatChipKb: "🎯 Compress to 200KB",
      chatChipPrivacy: "🔒 Are files uploaded?",
      chatChipHeic: "📱 iPhone HEIC to JPG",
      chatBackToChat: "← Back to Chat",
      chatInlineReqTitle: "🛠️ Quick Developer Request",
      chatInlineSentMsg: "Saved! You can also view or copy your ticket in the Developer Request section below.",
      chatSendAsReqBtn: "🛠️ Turn This into a Developer Request",
      chatGoCommentsBtn: "💬 Go to Comments",
      chatToolMatchPrefix: "Here are the matching tools — click one to open it immediately:",
      chatNoMatchText: "I didn't find an exact built-in tool for that query. Would you like to send it as a Developer Feature Request?",
      chatPrivacyReply: "All LeafConvert tools process files 100% inside your own browser memory. Nothing is ever uploaded or stored on external servers.",
      chatKbReply: "Use [Compress Image to Exact KB] to automatically fit photos under 100KB, 200KB, or 500KB for applications.",
      chatHeicReply: "Use [HEIC to JPG] to convert iPhone .HEIC photos to standard JPG or PNG in seconds.",
      chatLiveAgentBtn: "🧑‍💻 Open Live Support Widget",
      chatEndpointFailed: "⚠️ Could not reach remote webhook; saved locally so you can copy or retry."
    },
    ja: {
      navFeedbackBtn: "💬 コメント・要望",
      sectionTitle: "💬 コメント欄 ＆ 開発者への機能リクエスト",
      sectionSubtitle: "ご感想、ご質問、追加してほしい変換ツールや不具合報告をお気軽にお寄せください。",
      tabComments: "💬 コメント",
      tabRequest: "🛠️ 開発者リクエスト",
      localModeBadge: "💬 ブラウザ保存",
      localModeDesc: "入力したコメントや機能リクエストは、お使いのブラウザ内に安全に保存されます。",
      sharedModeBadge: "💬 ログイン不要の匿名共有コメント",
      sharedModeDesc: "ログイン不要で感想やご意見を投稿でき、すべての訪問者とリアルタイムに共有されます。",
      giscusModeBadge: "💬 共有コメント",
      giscusModeDesc: "他の訪問者とリアルタイムにコメントやリアクションを共有できます。",
      nickLabel: "ニックネーム",
      nickPlaceholder: "匿名 (任意)",
      commentTypeLabel: "カテゴリ",
      typePraise: "👍 感想",
      typeFeature: "✨ 機能要望",
      typeBug: "🐛 不具合報告",
      typeQuestion: "💬 質問",
      scopeLabel: "対象ツール",
      scopeAll: "サイト全体",
      commentPlaceholder: "使い心地や「こんな変換機能がほしい！」など自由にお書きください (Ctrl+Enter で投稿)",
      commentSubmitBtn: "コメントを投稿",
      filterAll: "すべて",
      filterCurrent: "このツールのみ",
      sortNewest: "新しい順",
      sortTop: "参考になった順",
      emptyCommentsTitle: "まだコメントはありません",
      emptyCommentsDesc: "最初のコメントを投稿してみましょう！下のボタンでテンプレートを入力できます。",
      starterPraise: "👍 感想を書く",
      starterFeature: "✨ 新機能を要望",
      starterBug: "🐛 不具合を報告",
      starterPraiseText: "サーバーにアップロードされずブラウザだけで変換できるので安心して使えました！",
      starterFeatureText: "開発者さん、次のアップデートで [希望の形式・機能] ツールを追加してもらえますか？",
      starterBugText: "[ツール名] で変換中にエラーが発生しました。ご確認をお願いします。",
      replyBtn: "返信",
      replyPlaceholder: "返信を入力...",
      replySubmitBtn: "返信を投稿",
      deleteBtn: "削除",
      helpfulBtn: "いいね",
      anonymousName: "匿名",
      justNow: "たった今",
      minsAgo: "分前",
      hoursAgo: "時間前",
      daysAgo: "日前",
      reqIntroTitle: "開発者へ機能リクエスト・不具合報告を送る",
      reqIntroDesc: "必要な変換フォーマットや改善点を教えていただければ、今後のアップデートに反映します。",
      reqCatLabel: "リクエスト種別",
      reqCatNewTool: "✨ 新しい変換ツール追加",
      reqCatImprove: "⚙️ 既存機能の改善",
      reqCatBug: "🐛 バグ・エラー報告",
      reqCatUi: "🎨 UI・デザイン要望",
      reqPriorityLabel: "優先度",
      reqPriNormal: "通常",
      reqPriHigh: "高（よく使う）",
      reqPriUrgent: "緊急（変換できない）",
      reqToolLabel: "関連ツール",
      reqToolNewProposal: "新機能提案 / サイト全体",
      reqTitleLabel: "件名 *",
      reqTitlePlaceholder: "例: AVIF変換やPDF余白一括調整機能を追加してほしい",
      reqDetailsLabel: "詳細 *",
      reqDetailsPlaceholder: "必要なファイル形式、オプション、またはエラーの発生状況をお書きください。",
      reqContactLabel: "連絡先 (任意)",
      reqContactPlaceholder: "メールアドレスまたはSNSハンドル (任意)",
      reqAttachEnvLabel: "現在のURL・ブラウザ・画面サイズ情報を添付する",
      reqCrossPostLabel: "コメント欄にも公開投稿して他のユーザーの賛同(👍)を集める",
      reqSubmitBtn: "📩 開発者リクエストを送信",
      reqSubmitting: "送信中...",
      reqListTitle: "送信したリクエスト履歴",
      reqEmptyDesc: "まだリクエスト履歴はありません。上のフォームから送信できます！",
      reqStatusSent: "開発者へ送信済み ✅",
      reqStatusLocal: "保存済み · コピー/送信可能 📋",
      reqCopyBtn: "📋 内容をコピー",
      reqGithubBtn: "🐙 GitHub Issue で送る",
      reqEmailBtn: "✉️ メールで送る",
      reqValidationError: "件名と詳細の両方を入力してください。",
      reqSubmittedSent: "✅ 開発者リクエストを送信しました！",
      reqSubmittedLocal: "📋 リクエストを保存しました！下のコピー・GitHub・メールボタンから送信できます。",
      reqTicketCopied: "✅ リクエスト内容をクリップボードにコピーしました！",
      toastCommentPosted: "✅ コメントを投稿しました！",
      toastCommentDeleted: "🗑️ 削除しました。",
      toastReplyPosted: "✅ 返信を投稿しました！",
      toastCommentValidation: "コメント本文を入力してください。",
      toastCommentRateLimit: "⏳ 数秒待ってからもう一度投稿してください。",
      toastCommentError: "⚠️ 処理中にエラーが発生しました。しばらくしてからお試しください。",
      chatFabLabel: "チャット・機能要望",
      chatTitle: "LeafConvert アシスタント",
      chatSubtitle: "ツール案内・開発者リクエスト",
      chatOpenReqBtn: "📋 要望書",
      chatClearBtn: "リセット",
      chatInputPlaceholder: "探している変換機能や要望を入力...",
      chatSendBtn: "送信",
      chatWelcome: "こんにちは！使いたいPDF・画像ツールのご案内や、新しい機能の開発者リクエストを承ります。",
      chatChipReq: "🛠️ 開発者リクエストを書く",
      chatChipComments: "💬 コメント欄へ移動",
      chatChipKb: "🎯 200KB以下に圧縮",
      chatChipPrivacy: "🔒 サーバー送信はありますか？",
      chatChipHeic: "📱 iPhone HEIC 変換",
      chatBackToChat: "← チャットに戻る",
      chatInlineReqTitle: "🛠️ クイック開発者リクエスト",
      chatInlineSentMsg: "登録しました！ページ下部のリクエスト履歴からも確認・コピーできます。",
      chatSendAsReqBtn: "🛠️ この内容で開発者リクエストを作成",
      chatGoCommentsBtn: "💬 コメント欄へ",
      chatToolMatchPrefix: "ご希望に合うツールが見つかりました。クリックですぐ開けます：",
      chatNoMatchText: "該当する既存ツールが見つかりませんでした。開発者リクエストとして送信しますか？",
      chatPrivacyReply: "LeafConvertの変換はすべてお使いのブラウザ内で完結し、外部サーバーへファイルが送信されることは一切ありません。",
      chatKbReply: "[目標容量(KB)指定圧縮] を使えば、100KB・200KB・500KB以下に自動調整できます。",
      chatHeicReply: "iPhoneのHEIC写真をJPG/PNGに変換するには [HEIC JPG変換] をお使いください。",
      chatLiveAgentBtn: "🧑‍💻 ライブサポートを開く",
      chatEndpointFailed: "⚠️ 外部送信に失敗したためローカルに保存しました。「内容をコピー」から共有できます。"
    },
    es: {
      navFeedbackBtn: "💬 Comentarios",
      sectionTitle: "💬 Comentarios y Solicitudes al Desarrollador",
      sectionSubtitle: "Comparte tu opinión, haz preguntas o pide nuevas herramientas y correcciones.",
      tabComments: "💬 Comentarios",
      tabRequest: "🛠️ Solicitud al Dev",
      localModeBadge: "💬 Guardado en tu Navegador",
      localModeDesc: "Tus comentarios y solicitudes se guardan de forma segura en este navegador.",
      sharedModeBadge: "💬 Comentarios Anónimos Compartidos",
      sharedModeDesc: "Deja opiniones o comentarios libremente sin iniciar sesión; se comparten con todos los visitantes.",
      giscusModeBadge: "💬 Comentarios Compartidos",
      giscusModeDesc: "Comparte comentarios y reacciones en tiempo real con otros visitantes.",
      nickLabel: "Nombre",
      nickPlaceholder: "Anónimo (opcional)",
      commentTypeLabel: "Etiqueta",
      typePraise: "👍 Opinión",
      typeFeature: "✨ Nueva Idea",
      typeBug: "🐛 Error / Bug",
      typeQuestion: "💬 Pregunta",
      scopeLabel: "Herramienta",
      scopeAll: "Todo el sitio",
      commentPlaceholder: "Cuéntanos qué te parece o qué convertidor te gustaría ver aquí... (Ctrl+Enter)",
      commentSubmitBtn: "Publicar Comentario",
      filterAll: "Todos",
      filterCurrent: "Solo esta herramienta",
      sortNewest: "Más recientes",
      sortTop: "Más útiles",
      emptyCommentsTitle: "Aún no hay comentarios",
      emptyCommentsDesc: "¡Sé el primero en comentar o pedir una función! Usa una plantilla rápida abajo:",
      starterPraise: "👍 Dejar Opinión",
      starterFeature: "✨ Pedir Función",
      starterBug: "🐛 Reportar Error",
      starterPraiseText: "¡Excelente que todo se convierta en mi navegador sin subir archivos a ningún servidor!",
      starterFeatureText: "¡Hola! ¿Podrían añadir una herramienta para convertir [formato o función]?",
      starterBugText: "Tuve un problema al usar [Herramienta]. Aquí están los detalles:",
      replyBtn: "Responder",
      replyPlaceholder: "Escribe una respuesta...",
      replySubmitBtn: "Responder",
      deleteBtn: "Eliminar",
      helpfulBtn: "Útil",
      anonymousName: "Anónimo",
      justNow: "Ahora",
      minsAgo: "m",
      hoursAgo: "h",
      daysAgo: "d",
      reqIntroTitle: "Enviar Solicitud de Función o Reporte al Desarrollador",
      reqIntroDesc: "Indícanos qué formato o mejora necesitas para priorizar futuras actualizaciones.",
      reqCatLabel: "Tipo de Solicitud",
      reqCatNewTool: "✨ Nueva Herramienta",
      reqCatImprove: "⚙️ Mejorar Herramienta",
      reqCatBug: "🐛 Reportar Error",
      reqCatUi: "🎨 Sugerencia de Diseño",
      reqPriorityLabel: "Prioridad",
      reqPriNormal: "Normal",
      reqPriHigh: "Alta (Muy necesario)",
      reqPriUrgent: "Urgente (Bloqueante)",
      reqToolLabel: "Herramienta Relacionada",
      reqToolNewProposal: "Nueva Herramienta / Todo el Sitio",
      reqTitleLabel: "Título *",
      reqTitlePlaceholder: "Ej: Añadir convertidor AVIF a JPG o ajuste de márgenes PDF",
      reqDetailsLabel: "Detalles *",
      reqDetailsPlaceholder: "Explica el formato, opciones deseadas o cómo reproducir el error.",
      reqContactLabel: "Contacto (opcional)",
      reqContactPlaceholder: "Email o usuario (opcional)",
      reqAttachEnvLabel: "Adjuntar URL actual, navegador y tamaño de pantalla",
      reqCrossPostLabel: "Publicar también en Comentarios para recibir votos (👍)",
      reqSubmitBtn: "📩 Enviar Solicitud",
      reqSubmitting: "Enviando...",
      reqListTitle: "Tus Solicitudes Enviadas",
      reqEmptyDesc: "Aún no has enviado solicitudes. Completa el formulario de arriba.",
      reqStatusSent: "Enviado al Desarrollador ✅",
      reqStatusLocal: "Guardado · Listo para Enviar 📋",
      reqCopyBtn: "📋 Copiar Solicitud",
      reqGithubBtn: "🐙 Abrir Issue en GitHub",
      reqEmailBtn: "✉️ Enviar por Email",
      reqValidationError: "Por favor completa el título y los detalles.",
      reqSubmittedSent: "✅ ¡Tu solicitud fue enviada al desarrollador!",
      reqSubmittedLocal: "📋 ¡Solicitud guardada! Usa los botones de Copiar, GitHub o Email para enviarla.",
      reqTicketCopied: "✅ ¡Solicitud copiada al portapapeles!",
      toastCommentPosted: "✅ ¡Comentario publicado!",
      toastCommentDeleted: "🗑️ Eliminado.",
      toastReplyPosted: "✅ ¡Respuesta publicada!",
      toastCommentValidation: "Por favor escribe un comentario.",
      toastCommentRateLimit: "⏳ Por favor espera unos segundos antes de volver a publicar.",
      toastCommentError: "⚠️ No se pudo completar la acción. Inténtalo de nuevo.",
      chatFabLabel: "Chat · Solicitar",
      chatTitle: "Asistente LeafConvert",
      chatSubtitle: "Ayuda · Buscar herramienta · Solicitud",
      chatOpenReqBtn: "📋 Solicitud",
      chatClearBtn: "Reiniciar",
      chatInputPlaceholder: "Pregunta o escribe una solicitud...",
      chatSendBtn: "Enviar",
      chatWelcome: "¡Hola! Pregúntame qué herramienta necesitas o envía una Solicitud al Desarrollador directamente.",
      chatChipReq: "🛠️ Enviar Solicitud",
      chatChipComments: "💬 Ir a Comentarios",
      chatChipKb: "🎯 Comprimir a 200KB",
      chatChipPrivacy: "🔒 ¿Suben mis archivos?",
      chatChipHeic: "📱 Convertir HEIC iPhone",
      chatBackToChat: "← Volver al Chat",
      chatInlineReqTitle: "🛠️ Solicitud Rápida al Desarrollador",
      chatInlineSentMsg: "¡Guardado! Puedes ver o copiar tu solicitud abajo.",
      chatSendAsReqBtn: "🛠️ Enviar esto como Solicitud al Dev",
      chatGoCommentsBtn: "💬 Ir a Comentarios",
      chatToolMatchPrefix: "Encontré estas herramientas para lo que buscas:",
      chatNoMatchText: "No encontré una herramienta exacta. ¿Quieres enviarlo como Solicitud al Desarrollador?",
      chatPrivacyReply: "Todo se procesa 100% en tu propio navegador. Tus archivos jamás se suben a servidores externos.",
      chatKbReply: "Usa [Comprimir Imagen a KB Exactos] para ajustar fotos bajo 100KB, 200KB o 500KB.",
      chatHeicReply: "Usa [HEIC a JPG] para convertir fotos de iPhone fácilmente.",
      chatLiveAgentBtn: "🧑‍💻 Abrir Soporte en Vivo",
      chatEndpointFailed: "⚠️ No se pudo enviar al webhook; guardado localmente para que puedas copiarlo."
    }
  };

  window.FEEDBACK_I18N = FEEDBACK_I18N;

  const fbState = {
    deps: null,
    activeTab: "comments",
    filterScope: "all",
    sortOrder: "newest",
    commentType: "praise",
    replyingToId: null,
    remoteComments: [],
    apiConnected: false,
    apiLoaded: false,
    apiBusy: false,
    chatOpen: false,
    chatInlineRequest: false,
    chatDraftTitle: "",
    liveChatLoaded: false
  };

  function ft() {
    const lang = fbState.deps ? fbState.deps.getLang() : "ko";
    return FEEDBACK_I18N[lang] || FEEDBACK_I18N.ko;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sanitizeId(raw) {
    return VALID_ID_RE.test(String(raw || "")) ? String(raw) : "";
  }

  function safeStorageGet(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function getUserToken() {
    try {
      let tok = window.localStorage.getItem(STORAGE_KEYS.token);
      if (!tok) {
        tok = "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        window.localStorage.setItem(STORAGE_KEYS.token, tok);
      }
      return tok;
    } catch (e) {
      return "u_session";
    }
  }

  function getSavedNickname() {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.nick) || "";
    } catch (e) {
      return "";
    }
  }

  function saveNickname(nick) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.nick, nick);
    } catch (e) {}
  }

  function formatRelativeTime(ts) {
    const s = ft();
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return s.justNow;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}${s.minsAgo}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${s.hoursAgo}`;
    const days = Math.floor(hrs / 24);
    return `${days}${s.daysAgo}`;
  }

  function getToolDisplayName(toolId) {
    const s = ft();
    if (!toolId || toolId === "all") return s.scopeAll;
    const lang = fbState.deps ? fbState.deps.getLang() : "ko";
    const tool = (window.TOOLS_CATALOG || []).find((x) => x.id === toolId);
    if (!tool) return s.scopeAll;
    return `${tool.icon} ${tool.names[lang] || tool.names.en}`;
  }

  function getAvatarColor(name) {
    const palette = ["#e5322d", "#2563eb", "#059669", "#7c3aed", "#d97706", "#0891b2", "#db2777"];
    let hash = 0;
    const str = String(name || "SC");
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  function getConfig() {
    return window.FEEDBACK_CONFIG || { commentProvider: "local", giscus: {}, requestDelivery: {}, liveChat: {} };
  }

  function hasValidGiscusConfig(cfg) {
    return (
      cfg.commentProvider === "giscus" &&
      cfg.giscus &&
      Boolean(cfg.giscus.repo && cfg.giscus.repoId && cfg.giscus.categoryId)
    );
  }

  function getCommentsApiUrl(cfg) {
    if (!cfg || cfg.commentProvider !== "api") return "";
    return cfg.commentsApiUrl || "/api/comments";
  }

  function useRemoteComments(cfg) {
    return Boolean(getCommentsApiUrl(cfg) && fbState.apiConnected);
  }

  function refreshRemoteCommentsDom() {
    const s = ft();
    const cfg = getConfig();
    const isRemote = useRemoteComments(cfg);
    const feedEl = document.getElementById("fbCommentsFeed");
    if (feedEl) {
      feedEl.innerHTML = renderCommentsFeedHtml();
    }
    const countEl = document.getElementById("fbCommentsTabCount");
    if (countEl) {
      const localCount = safeStorageGet(STORAGE_KEYS.comments, []).length;
      countEl.textContent = String(isRemote ? fbState.remoteComments.length : localCount);
    }
    const filterAllBtn = document.querySelector('[data-fb-filter="all"]');
    if (filterAllBtn) {
      const allCount = isRemote
        ? fbState.remoteComments.length
        : safeStorageGet(STORAGE_KEYS.comments, []).length;
      filterAllBtn.textContent = `${s.filterAll} (${allCount})`;
    }
    const pillEl = document.getElementById("fbModePill");
    const descEl = document.getElementById("fbModeText");
    if (pillEl && descEl && !hasValidGiscusConfig(cfg)) {
      pillEl.textContent = isRemote ? s.sharedModeBadge : s.localModeBadge;
      descEl.textContent = isRemote ? s.sharedModeDesc : s.localModeDesc;
    }
  }

  async function fetchRemoteComments() {
    const cfg = getConfig();
    const apiUrl = getCommentsApiUrl(cfg);
    if (!apiUrl || typeof fetch !== "function") {
      fbState.apiLoaded = true;
      return false;
    }
    try {
      const res = await fetch(apiUrl, {
        method: "GET",
        headers: { "X-User-Token": getUserToken() },
        cache: "no-store"
      });
      if (!res.ok) {
        fbState.apiConnected = false;
        fbState.apiLoaded = true;
        return false;
      }
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.comments)) {
        fbState.remoteComments = data.comments;
        fbState.apiConnected = true;
        fbState.apiLoaded = true;
        refreshRemoteCommentsDom();
        return true;
      }
    } catch (e) {}
    fbState.apiConnected = false;
    fbState.apiLoaded = true;
    return false;
  }

  async function postRemoteCommentAction(payload) {
    const apiUrl = getCommentsApiUrl(getConfig());
    if (!apiUrl || typeof fetch !== "function") {
      return { ok: false, status: 0, data: null };
    }
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Token": getUserToken()
        },
        body: JSON.stringify(Object.assign({}, payload, { authorToken: getUserToken() }))
      });
      const data = await res.json().catch(() => null);
      return { ok: Boolean(res.ok && data && data.ok), status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: null };
    }
  }

  function notifyRemoteFailure(status) {
    const s = ft();
    notifyToast(status === 429 ? s.toastCommentRateLimit : s.toastCommentError);
  }

  function isSafeHttpUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");
  }

  function notifyToast(msg) {
    if (fbState.deps && typeof fbState.deps.onShowToast === "function") {
      fbState.deps.onShowToast(msg);
    }
  }

  function getCommentTypeMeta(type) {
    const s = ft();
    const map = {
      praise: { label: s.typePraise, cls: "tag-praise" },
      feature: { label: s.typeFeature, cls: "tag-feature" },
      bug: { label: s.typeBug, cls: "tag-bug" },
      question: { label: s.typeQuestion, cls: "tag-question" }
    };
    return map[type] || map.question;
  }

  function renderToolSelectOptions(selectedVal, includeNewProposalLabel) {
    const s = ft();
    const lang = fbState.deps ? fbState.deps.getLang() : "ko";
    const firstLabel = includeNewProposalLabel ? s.reqToolNewProposal : s.scopeAll;
    const tools = window.TOOLS_CATALOG || [];
    return [
      `<option value="all"${selectedVal === "all" ? " selected" : ""}>${escapeHtml(firstLabel)}</option>`,
      ...tools.map((tool) => {
        const label = `${tool.icon} ${tool.names[lang] || tool.names.en}`;
        return `<option value="${escapeHtml(tool.id)}"${selectedVal === tool.id ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
    ].join("");
  }

  function mountGiscusWidget(container) {
    const cfg = getConfig();
    if (!container || !hasValidGiscusConfig(cfg)) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-repo", cfg.giscus.repo);
    script.setAttribute("data-repo-id", cfg.giscus.repoId);
    script.setAttribute("data-category", cfg.giscus.category || "Announcements");
    script.setAttribute("data-category-id", cfg.giscus.categoryId);
    script.setAttribute("data-mapping", cfg.giscus.mapping || "pathname");
    script.setAttribute("data-strict", cfg.giscus.strict || "0");
    script.setAttribute("data-reactions-enabled", cfg.giscus.reactionsEnabled || "1");
    script.setAttribute("data-emit-metadata", cfg.giscus.emitMetadata || "0");
    script.setAttribute("data-input-position", cfg.giscus.inputPosition || "top");
    script.setAttribute("data-theme", fbState.deps && fbState.deps.getTheme() === "dark" ? "dark" : "light");
    script.setAttribute("data-lang", fbState.deps ? fbState.deps.getLang() : "ko");
    container.appendChild(script);
  }

  function addLocalComment({ nick, type, scope, text }) {
    const s = ft();
    const cleanNick = (nick || "").trim().slice(0, 30) || s.anonymousName;
    if (nick && nick.trim()) saveNickname(nick.trim().slice(0, 30));

    const comments = safeStorageGet(STORAGE_KEYS.comments, []);
    comments.unshift({
      id: "cmt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      authorToken: getUserToken(),
      nick: cleanNick,
      type: type || "question",
      scope: scope || "all",
      text: text.trim().slice(0, 1000),
      createdAt: Date.now(),
      likes: 0,
      replies: []
    });
    safeStorageSet(STORAGE_KEYS.comments, comments);
  }

  function renderCommentsFeedHtml() {
    const s = ft();
    const activeToolId = fbState.deps ? fbState.deps.getToolId() : null;
    const myToken = getUserToken();
    const isRemote = useRemoteComments(getConfig());
    const likedMap = safeStorageGet(STORAGE_KEYS.likes, {});
    let comments = isRemote ? [...fbState.remoteComments] : safeStorageGet(STORAGE_KEYS.comments, []);

    if (fbState.filterScope === "current" && activeToolId) {
      comments = comments.filter((c) => c.scope === activeToolId);
    }

    if (fbState.sortOrder === "top") {
      comments = [...comments].sort((a, b) => (b.likes || 0) - (a.likes || 0) || b.createdAt - a.createdAt);
    } else {
      comments = [...comments].sort((a, b) => b.createdAt - a.createdAt);
    }

    if (comments.length === 0) {
      return `
        <div class="fb-empty-state">
          <div class="fb-empty-icon">💬</div>
          <h4>${escapeHtml(s.emptyCommentsTitle)}</h4>
          <p>${escapeHtml(s.emptyCommentsDesc)}</p>
          <div class="fb-starter-chips">
            <button type="button" class="fb-starter-chip" data-starter="praise">${escapeHtml(s.starterPraise)}</button>
            <button type="button" class="fb-starter-chip" data-starter="feature">${escapeHtml(s.starterFeature)}</button>
            <button type="button" class="fb-starter-chip" data-starter="bug">${escapeHtml(s.starterBug)}</button>
          </div>
        </div>
      `;
    }

    return comments
      .map((c) => {
        const typeMeta = getCommentTypeMeta(c.type);
        const scopeLabel = getToolDisplayName(c.scope);
        const avatarBg = getAvatarColor(c.nick);
        const initial = escapeHtml((c.nick || "G").trim().slice(0, 1).toUpperCase());
        const isLiked = isRemote ? Boolean(c.liked) : Boolean(likedMap[c.id]);
        const isMine = Boolean(c.isMine || (c.authorToken && c.authorToken === myToken));
        const replies = Array.isArray(c.replies) ? c.replies : [];

        const repliesHtml = replies.length
          ? `<div class="fb-reply-list">
              ${replies
                .map(
                  (r) => `
                <div class="fb-reply-item">
                  <div class="fb-reply-meta">
                    <strong>${escapeHtml(r.nick)}</strong>
                    <span>${escapeHtml(formatRelativeTime(r.createdAt))}</span>
                    ${
                      Boolean(r.isMine || (r.authorToken && r.authorToken === myToken))
                        ? `<button type="button" class="fb-text-danger" data-del-reply="${escapeHtml(r.id)}" data-parent-id="${escapeHtml(c.id)}">${escapeHtml(s.deleteBtn)}</button>`
                        : ""
                    }
                  </div>
                  <div class="fb-reply-text">${escapeHtml(r.text)}</div>
                </div>`
                )
                .join("")}
            </div>`
          : "";

        const replyBoxHtml =
          fbState.replyingToId === c.id
            ? `
            <div class="fb-reply-composer">
              <input type="text" class="fb-input fb-reply-input" id="replyInput-${escapeHtml(c.id)}" maxlength="500" placeholder="${escapeHtml(s.replyPlaceholder)}" />
              <button type="button" class="fb-mini-primary" data-submit-reply="${escapeHtml(c.id)}">${escapeHtml(s.replySubmitBtn)}</button>
            </div>`
            : "";

        return `
          <article class="fb-comment-card">
            <div class="fb-comment-top">
              <div class="fb-avatar" style="background:${avatarBg}">${initial}</div>
              <div class="fb-comment-meta">
                <div class="fb-comment-author-row">
                  <strong class="fb-author-name">${escapeHtml(c.nick)}</strong>
                  <span class="fb-type-badge ${typeMeta.cls}">${escapeHtml(typeMeta.label)}</span>
                  ${
                    c.scope && c.scope !== "all"
                      ? `<button type="button" class="fb-scope-link" data-jump-tool="${escapeHtml(c.scope)}">${escapeHtml(scopeLabel)}</button>`
                      : `<span class="fb-scope-tag">${escapeHtml(scopeLabel)}</span>`
                  }
                </div>
                <span class="fb-time">${escapeHtml(formatRelativeTime(c.createdAt))}</span>
              </div>
              ${
                isMine
                  ? `<button type="button" class="fb-icon-del" data-del-comment="${escapeHtml(c.id)}" title="${escapeHtml(s.deleteBtn)}">🗑️</button>`
                  : ""
              }
            </div>
            <div class="fb-comment-body">${escapeHtml(c.text)}</div>
            <div class="fb-comment-actions">
              <button type="button" class="fb-act-btn${isLiked ? " active" : ""}" data-like-comment="${escapeHtml(c.id)}">
                👍 ${escapeHtml(s.helpfulBtn)} <span>${Number(c.likes || 0)}</span>
              </button>
              <button type="button" class="fb-act-btn" data-open-reply="${escapeHtml(c.id)}">
                ↩ ${escapeHtml(s.replyBtn)} ${replies.length ? `(${replies.length})` : ""}
              </button>
            </div>
            ${replyBoxHtml}
            ${repliesHtml}
          </article>
        `;
      })
      .join("");
  }

  function buildRequestPlainText(ticket) {
    const lines = [
      `[LeafConvert Developer Request #${ticket.id}]`,
      `• Type: ${ticket.categoryLabel}`,
      `• Priority: ${ticket.priorityLabel}`,
      `• Tool: ${ticket.toolLabel}`,
      `• Title: ${ticket.title}`,
      `• Details:\n${ticket.details}`
    ];
    if (ticket.contact) lines.push(`• Contact: ${ticket.contact}`);
    if (ticket.env) lines.push(`• Environment: ${ticket.env}`);
    lines.push(`• Created: ${new Date(ticket.createdAt).toISOString()}`);
    return lines.join("\n");
  }

  function buildGithubIssueUrl(repo, ticket) {
    const cleanRepo = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleanRepo)) return "";
    const title = encodeURIComponent(`[Request] ${ticket.title}`);
    const body = encodeURIComponent(buildRequestPlainText(ticket));
    return `https://github.com/${cleanRepo}/issues/new?title=${title}&body=${body}`;
  }

  function buildMailtoUrl(email, ticket) {
    const clean = String(email || "").trim();
    if (!clean || !clean.includes("@")) return "";
    const subject = encodeURIComponent(`[LeafConvert #${ticket.id}] ${ticket.title}`);
    const body = encodeURIComponent(buildRequestPlainText(ticket));
    return `mailto:${clean}?subject=${subject}&body=${body}`;
  }

  async function submitFeatureRequest(payload) {
    const s = ft();
    const cfg = getConfig();
    const activeToolId = fbState.deps ? fbState.deps.getToolId() : null;
    const catMap = {
      newTool: s.reqCatNewTool,
      improve: s.reqCatImprove,
      bug: s.reqCatBug,
      ui: s.reqCatUi
    };
    const priMap = {
      normal: s.reqPriNormal,
      high: s.reqPriHigh,
      urgent: s.reqPriUrgent
    };

    const now = new Date();
    const ymd =
      String(now.getFullYear()).slice(-2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const ticketId = `REQ-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const envStr = payload.attachEnv
      ? `URL=${window.location.href} | Lang=${fbState.deps ? fbState.deps.getLang() : "ko"} | Viewport=${window.innerWidth}x${window.innerHeight} | UA=${(navigator.userAgent || "").slice(0, 100)}`
      : "";

    const ticket = {
      id: ticketId,
      category: payload.category || "newTool",
      categoryLabel: catMap[payload.category] || s.reqCatNewTool,
      priority: payload.priority || "normal",
      priorityLabel: priMap[payload.priority] || s.reqPriNormal,
      toolId: payload.toolId || activeToolId || "all",
      toolLabel: getToolDisplayName(payload.toolId || activeToolId || "all"),
      title: String(payload.title || "").trim().slice(0, 120),
      details: String(payload.details || "").trim().slice(0, 2000),
      contact: String(payload.contact || "").trim().slice(0, 120),
      env: envStr,
      createdAt: Date.now(),
      deliveryStatus: "local"
    };

    let sentRemotely = false;
    let endpointError = false;
    let endpointStatus = 0;
    const endpoint = cfg.requestDelivery && cfg.requestDelivery.endpoint;

    if (isSafeHttpUrl(endpoint)) {
      try {
        const authorToken = getUserToken();
        const res = await fetch(endpoint.trim(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-User-Token": authorToken
          },
          body: JSON.stringify({
            ticketId: ticket.id,
            category: ticket.categoryLabel,
            priority: ticket.priorityLabel,
            tool: ticket.toolLabel,
            title: ticket.title,
            details: ticket.details,
            contact: ticket.contact,
            env: ticket.env,
            authorToken
          })
        });
        endpointStatus = res.status || 0;
        if (res.ok) {
          ticket.deliveryStatus = "sent";
          sentRemotely = true;
        } else {
          endpointError = true;
        }
      } catch (err) {
        endpointError = true;
      }
    }

    const requests = safeStorageGet(STORAGE_KEYS.requests, []);
    requests.unshift(ticket);
    safeStorageSet(STORAGE_KEYS.requests, requests);

    if (payload.crossPost) {
      const crossNick = payload.contact ? payload.contact.split("@")[0] : getSavedNickname();
      const crossType = payload.category === "bug" ? "bug" : "feature";
      const crossText = `[${ticket.categoryLabel} #${ticket.id}] ${ticket.title}\n${ticket.details}`;
      if (useRemoteComments(cfg)) {
        const res = await postRemoteCommentAction({
          action: "createComment",
          nick: crossNick || s.anonymousName,
          type: crossType,
          scope: ticket.toolId,
          text: crossText
        });
        if (res.ok && res.data && res.data.comment) {
          fbState.remoteComments.unshift(res.data.comment);
        }
      } else {
        addLocalComment({
          nick: crossNick,
          type: crossType,
          scope: ticket.toolId,
          text: crossText
        });
      }
    }

    return { ticket, sentRemotely, endpointError, endpointStatus };
  }

  function getRequestSubmitToast(result, s) {
    if (result.endpointError) {
      return result.endpointStatus === 429 ? s.toastCommentRateLimit : s.chatEndpointFailed;
    }
    return result.sentRemotely ? s.reqSubmittedSent : s.reqSubmittedLocal;
  }

  function renderRequestsListHtml() {
    const s = ft();
    const cfg = getConfig();
    const requests = safeStorageGet(STORAGE_KEYS.requests, []);
    if (requests.length === 0) {
      return `<div class="fb-req-empty">${escapeHtml(s.reqEmptyDesc)}</div>`;
    }

    return requests
      .map((req) => {
        const statusCls = req.deliveryStatus === "sent" ? "status-sent" : "status-local";
        const statusTxt = req.deliveryStatus === "sent" ? s.reqStatusSent : s.reqStatusLocal;
        const ghUrl = buildGithubIssueUrl(cfg.requestDelivery && cfg.requestDelivery.githubRepo, req);
        const mailUrl = buildMailtoUrl(cfg.requestDelivery && cfg.requestDelivery.contactEmail, req);

        return `
          <article class="fb-req-card">
            <div class="fb-req-card-head">
              <div class="fb-req-badges">
                <span class="fb-ticket-id">#${escapeHtml(req.id)}</span>
                <span class="fb-type-badge tag-feature">${escapeHtml(req.categoryLabel)}</span>
                <span class="fb-pri-badge pri-${escapeHtml(req.priority)}">${escapeHtml(req.priorityLabel)}</span>
                <span class="fb-status-pill ${statusCls}">${escapeHtml(statusTxt)}</span>
              </div>
              <button type="button" class="fb-icon-del" data-del-req="${escapeHtml(req.id)}" title="${escapeHtml(s.deleteBtn)}">🗑️</button>
            </div>
            <h4 class="fb-req-title">${escapeHtml(req.title)}</h4>
            <p class="fb-req-desc">${escapeHtml(req.details)}</p>
            <div class="fb-req-meta">
              <span>🛠️ ${escapeHtml(req.toolLabel)}</span>
              <span>🕒 ${escapeHtml(formatRelativeTime(req.createdAt))}</span>
              ${req.contact ? `<span>👤 ${escapeHtml(req.contact)}</span>` : ""}
            </div>
            <div class="fb-req-actions">
              <button type="button" class="fb-act-btn" data-copy-req="${escapeHtml(req.id)}">${escapeHtml(s.reqCopyBtn)}</button>
              ${ghUrl ? `<a class="fb-act-btn" href="${escapeHtml(ghUrl)}" target="_blank" rel="noopener">${escapeHtml(s.reqGithubBtn)}</a>` : ""}
              ${mailUrl ? `<a class="fb-act-btn" href="${escapeHtml(mailUrl)}">${escapeHtml(s.reqEmailBtn)}</a>` : ""}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderCommunitySection() {
    const container = document.getElementById("communitySection");
    if (!container) return;

    const s = ft();
    const cfg = getConfig();
    const giscusActive = hasValidGiscusConfig(cfg);
    const isRemote = useRemoteComments(cfg);
    const activeToolId = fbState.deps ? fbState.deps.getToolId() : null;
    const allComments = isRemote ? fbState.remoteComments : safeStorageGet(STORAGE_KEYS.comments, []);
    const allRequests = safeStorageGet(STORAGE_KEYS.requests, []);
    const savedNick = getSavedNickname();
    const defaultScope = activeToolId || "all";

    const modeBadge = giscusActive
      ? s.giscusModeBadge
      : isRemote
      ? s.sharedModeBadge
      : s.localModeBadge;
    const modeDesc = giscusActive
      ? s.giscusModeDesc
      : isRemote
      ? s.sharedModeDesc
      : s.localModeDesc;

    const commentsPanelHtml = giscusActive
      ? `<div id="giscusMount" class="fb-giscus-mount"></div>`
      : `
        <form id="commentForm" class="fb-composer" novalidate>
          <div class="fb-composer-row">
            <div class="fb-field">
              <label for="fbNickInput">${escapeHtml(s.nickLabel)}</label>
              <input type="text" id="fbNickInput" class="fb-input" maxlength="30" value="${escapeHtml(savedNick)}" placeholder="${escapeHtml(s.nickPlaceholder)}" />
            </div>
            <div class="fb-field">
              <label for="fbScopeSelect">${escapeHtml(s.scopeLabel)}</label>
              <select id="fbScopeSelect" class="fb-select">${renderToolSelectOptions(defaultScope, false)}</select>
            </div>
          </div>

          <div class="fb-type-pills" role="group" aria-label="${escapeHtml(s.commentTypeLabel)}">
            ${[
              ["praise", s.typePraise],
              ["feature", s.typeFeature],
              ["bug", s.typeBug],
              ["question", s.typeQuestion]
            ]
              .map(
                ([key, label]) =>
                  `<button type="button" class="fb-type-pill${fbState.commentType === key ? " active" : ""}" data-comment-type="${key}">${escapeHtml(label)}</button>`
              )
              .join("")}
          </div>

          <textarea id="fbCommentTextarea" class="fb-textarea" rows="3" maxlength="1000" placeholder="${escapeHtml(s.commentPlaceholder)}"></textarea>

          <div class="fb-composer-footer">
            <span class="fb-char-counter" id="fbCharCounter">0 / 1000</span>
            <button type="submit" class="fb-primary-btn">${escapeHtml(s.commentSubmitBtn)}</button>
          </div>
        </form>

        <div class="fb-feed-toolbar">
          <div class="fb-filter-pills">
            <button type="button" class="fb-filter-btn${fbState.filterScope === "all" ? " active" : ""}" data-fb-filter="all">${escapeHtml(s.filterAll)} (${allComments.length})</button>
            ${
              activeToolId
                ? `<button type="button" class="fb-filter-btn${fbState.filterScope === "current" ? " active" : ""}" data-fb-filter="current">${escapeHtml(s.filterCurrent)}</button>`
                : ""
            }
          </div>
          <select id="fbSortSelect" class="fb-select fb-sort-select" aria-label="Sort comments">
            <option value="newest"${fbState.sortOrder === "newest" ? " selected" : ""}>${escapeHtml(s.sortNewest)}</option>
            <option value="top"${fbState.sortOrder === "top" ? " selected" : ""}>${escapeHtml(s.sortTop)}</option>
          </select>
        </div>

        <div class="fb-comments-feed" id="fbCommentsFeed">
          ${renderCommentsFeedHtml()}
        </div>
      `;

    const requestPanelHtml = `
      <div class="fb-req-intro">
        <strong>📋 ${escapeHtml(s.reqIntroTitle)}</strong>
        <p>${escapeHtml(s.reqIntroDesc)}</p>
      </div>

      <form id="devRequestForm" class="fb-composer" novalidate>
        <div class="fb-composer-row fb-composer-3">
          <div class="fb-field">
            <label for="reqCategorySelect">${escapeHtml(s.reqCatLabel)}</label>
            <select id="reqCategorySelect" class="fb-select">
              <option value="newTool">${escapeHtml(s.reqCatNewTool)}</option>
              <option value="improve">${escapeHtml(s.reqCatImprove)}</option>
              <option value="bug">${escapeHtml(s.reqCatBug)}</option>
              <option value="ui">${escapeHtml(s.reqCatUi)}</option>
            </select>
          </div>
          <div class="fb-field">
            <label for="reqToolSelect">${escapeHtml(s.reqToolLabel)}</label>
            <select id="reqToolSelect" class="fb-select">${renderToolSelectOptions(defaultScope, true)}</select>
          </div>
          <div class="fb-field">
            <label for="reqPrioritySelect">${escapeHtml(s.reqPriorityLabel)}</label>
            <select id="reqPrioritySelect" class="fb-select">
              <option value="normal">${escapeHtml(s.reqPriNormal)}</option>
              <option value="high">${escapeHtml(s.reqPriHigh)}</option>
              <option value="urgent">${escapeHtml(s.reqPriUrgent)}</option>
            </select>
          </div>
        </div>

        <div class="fb-composer-row">
          <div class="fb-field">
            <label for="reqTitleInput">${escapeHtml(s.reqTitleLabel)}</label>
            <input type="text" id="reqTitleInput" class="fb-input" maxlength="120" required placeholder="${escapeHtml(s.reqTitlePlaceholder)}" />
          </div>
          <div class="fb-field">
            <label for="reqContactInput">${escapeHtml(s.reqContactLabel)}</label>
            <input type="text" id="reqContactInput" class="fb-input" maxlength="120" placeholder="${escapeHtml(s.reqContactPlaceholder)}" />
          </div>
        </div>

        <div class="fb-field">
          <label for="reqDetailsTextarea">${escapeHtml(s.reqDetailsLabel)}</label>
          <textarea id="reqDetailsTextarea" class="fb-textarea" rows="3" maxlength="2000" required placeholder="${escapeHtml(s.reqDetailsPlaceholder)}"></textarea>
        </div>

        <div class="fb-checkbox-col">
          <label class="fb-check-label">
            <input type="checkbox" id="reqAttachEnvChk" checked />
            <span>${escapeHtml(s.reqAttachEnvLabel)}</span>
          </label>
          ${
            !giscusActive
              ? `<label class="fb-check-label">
                  <input type="checkbox" id="reqCrossPostChk" checked />
                  <span>${escapeHtml(s.reqCrossPostLabel)}</span>
                </label>`
              : ""
          }
        </div>

        <div class="fb-composer-footer">
          <span></span>
          <button type="submit" id="reqSubmitBtn" class="fb-primary-btn">${escapeHtml(s.reqSubmitBtn)}</button>
        </div>
      </form>

      <div class="fb-req-history">
        <h3 class="fb-req-history-title">${escapeHtml(s.reqListTitle)} (${allRequests.length})</h3>
        <div class="fb-req-list" id="fbRequestsList">
          ${renderRequestsListHtml()}
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="fb-shell">
        <div class="fb-header">
          <div>
            <h2>${escapeHtml(s.sectionTitle)}</h2>
            <p>${escapeHtml(s.sectionSubtitle)}</p>
          </div>
          <div class="fb-tabs" role="tablist">
            <button type="button" class="fb-tab-btn${fbState.activeTab === "comments" ? " active" : ""}" data-fb-tab="comments" role="tab">
              ${escapeHtml(s.tabComments)}${giscusActive ? "" : ` <span class="fb-tab-count" id="fbCommentsTabCount">${allComments.length}</span>`}
            </button>
            <button type="button" class="fb-tab-btn${fbState.activeTab === "request" ? " active" : ""}" data-fb-tab="request" role="tab">
              ${escapeHtml(s.tabRequest)} <span class="fb-tab-count">${allRequests.length}</span>
            </button>
          </div>
        </div>

        <div class="fb-mode-banner">
          <span class="fb-mode-pill" id="fbModePill">${escapeHtml(modeBadge)}</span>
          <span class="fb-mode-text" id="fbModeText">${escapeHtml(modeDesc)}</span>
        </div>

        <div class="fb-panel-body">
          ${fbState.activeTab === "comments" ? commentsPanelHtml : requestPanelHtml}
        </div>
      </div>
    `;

    if (fbState.activeTab === "comments" && giscusActive) {
      mountGiscusWidget(document.getElementById("giscusMount"));
    }

    bindCommunityEvents(container);
  }

  function bindCommunityEvents(container) {
    const s = ft();

    container.querySelectorAll("[data-fb-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        fbState.activeTab = btn.getAttribute("data-fb-tab");
        renderCommunitySection();
      });
    });

    // Comments tab handlers
    container.querySelectorAll("[data-comment-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        fbState.commentType = btn.getAttribute("data-comment-type");
        container.querySelectorAll("[data-comment-type]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
      });
    });

    const textarea = document.getElementById("fbCommentTextarea");
    const counter = document.getElementById("fbCharCounter");
    if (textarea && counter) {
      textarea.addEventListener("input", () => {
        counter.textContent = `${textarea.value.length} / 1000`;
      });
      textarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          const form = document.getElementById("commentForm");
          if (form) form.requestSubmit();
        }
      });
    }

    const commentForm = document.getElementById("commentForm");
    if (commentForm) {
      commentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (fbState.apiBusy) return;
        const textEl = document.getElementById("fbCommentTextarea");
        const nickEl = document.getElementById("fbNickInput");
        const scopeEl = document.getElementById("fbScopeSelect");
        const text = textEl ? textEl.value.trim() : "";
        if (!text) {
          notifyToast(s.toastCommentValidation);
          if (textEl) textEl.focus();
          return;
        }
        const rawNick = nickEl ? nickEl.value.trim().slice(0, 30) : "";
        if (rawNick) saveNickname(rawNick);
        const scopeVal = scopeEl ? scopeEl.value : "all";

        const cfg = getConfig();
        if (getCommentsApiUrl(cfg) && !fbState.apiLoaded) {
          await fetchRemoteComments();
        }

        if (useRemoteComments(cfg)) {
          fbState.apiBusy = true;
          const submitBtn = commentForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;
          const res = await postRemoteCommentAction({
            action: "createComment",
            nick: rawNick || s.anonymousName,
            type: fbState.commentType,
            scope: scopeVal,
            text
          });
          fbState.apiBusy = false;
          if (submitBtn) submitBtn.disabled = false;
          if (!res.ok || !res.data || !res.data.comment) {
            notifyRemoteFailure(res.status);
            return;
          }
          fbState.remoteComments.unshift(res.data.comment);
          notifyToast(s.toastCommentPosted);
          renderCommunitySection();
          return;
        }

        addLocalComment({
          nick: rawNick,
          type: fbState.commentType,
          scope: scopeVal,
          text
        });
        notifyToast(s.toastCommentPosted);
        renderCommunitySection();
      });
    }

    container.querySelectorAll("[data-fb-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        fbState.filterScope = btn.getAttribute("data-fb-filter");
        renderCommunitySection();
      });
    });

    const sortSel = document.getElementById("fbSortSelect");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        fbState.sortOrder = e.target.value;
        renderCommunitySection();
      });
    }

    const feed = document.getElementById("fbCommentsFeed");
    if (feed) {
      feed.addEventListener("click", async (e) => {
        const starterBtn = e.target.closest("[data-starter]");
        if (starterBtn && textarea) {
          const kind = starterBtn.getAttribute("data-starter");
          fbState.commentType = kind;
          container.querySelectorAll("[data-comment-type]").forEach((b) =>
            b.classList.toggle("active", b.getAttribute("data-comment-type") === kind)
          );
          const presetMap = {
            praise: s.starterPraiseText,
            feature: s.starterFeatureText,
            bug: s.starterBugText
          };
          textarea.value = presetMap[kind] || "";
          if (counter) counter.textContent = `${textarea.value.length} / 1000`;
          textarea.focus();
          return;
        }

        const likeBtn = e.target.closest("[data-like-comment]");
        if (likeBtn) {
          const cid = likeBtn.getAttribute("data-like-comment");
          if (useRemoteComments(getConfig())) {
            const res = await postRemoteCommentAction({ action: "toggleLike", commentId: cid });
            if (!res.ok || !res.data) {
              notifyRemoteFailure(res.status);
              return;
            }
            const target = fbState.remoteComments.find((x) => x.id === cid);
            if (target) {
              target.likes = res.data.likes;
              target.liked = res.data.liked;
              renderCommunitySection();
            }
            return;
          }
          const likedMap = safeStorageGet(STORAGE_KEYS.likes, {});
          const comments = safeStorageGet(STORAGE_KEYS.comments, []);
          const target = comments.find((x) => x.id === cid);
          if (target) {
            if (likedMap[cid]) {
              delete likedMap[cid];
              target.likes = Math.max(0, (target.likes || 0) - 1);
            } else {
              likedMap[cid] = true;
              target.likes = (target.likes || 0) + 1;
            }
            safeStorageSet(STORAGE_KEYS.likes, likedMap);
            safeStorageSet(STORAGE_KEYS.comments, comments);
            renderCommunitySection();
          }
          return;
        }

        const delBtn = e.target.closest("[data-del-comment]");
        if (delBtn) {
          const cid = delBtn.getAttribute("data-del-comment");
          if (useRemoteComments(getConfig())) {
            const res = await postRemoteCommentAction({ action: "deleteComment", commentId: cid });
            if (!res.ok) {
              notifyRemoteFailure(res.status);
              return;
            }
            fbState.remoteComments = fbState.remoteComments.filter((x) => x.id !== cid);
            notifyToast(s.toastCommentDeleted);
            renderCommunitySection();
            return;
          }
          const myTok = getUserToken();
          const comments = safeStorageGet(STORAGE_KEYS.comments, []).filter(
            (x) => !(x.id === cid && x.authorToken === myTok)
          );
          safeStorageSet(STORAGE_KEYS.comments, comments);
          notifyToast(s.toastCommentDeleted);
          renderCommunitySection();
          return;
        }

        const replyOpenBtn = e.target.closest("[data-open-reply]");
        if (replyOpenBtn) {
          const cid = replyOpenBtn.getAttribute("data-open-reply");
          fbState.replyingToId = fbState.replyingToId === cid ? null : cid;
          renderCommunitySection();
          const ri = document.getElementById(`replyInput-${cid}`);
          if (ri) ri.focus();
          return;
        }

        const replySubmitBtn = e.target.closest("[data-submit-reply]");
        if (replySubmitBtn) {
          const cid = replySubmitBtn.getAttribute("data-submit-reply");
          const input = document.getElementById(`replyInput-${cid}`);
          const replyText = input ? input.value.trim().slice(0, 500) : "";
          if (!replyText) {
            notifyToast(s.toastCommentValidation);
            return;
          }
          if (useRemoteComments(getConfig())) {
            const res = await postRemoteCommentAction({
              action: "createReply",
              commentId: cid,
              nick: getSavedNickname() || s.anonymousName,
              text: replyText
            });
            if (!res.ok || !res.data || !res.data.reply) {
              notifyRemoteFailure(res.status);
              return;
            }
            const target = fbState.remoteComments.find((x) => x.id === cid);
            if (target) {
              target.replies = Array.isArray(target.replies) ? target.replies : [];
              target.replies.push(res.data.reply);
            }
            fbState.replyingToId = null;
            notifyToast(s.toastReplyPosted);
            renderCommunitySection();
            return;
          }
          const comments = safeStorageGet(STORAGE_KEYS.comments, []);
          const target = comments.find((x) => x.id === cid);
          if (target) {
            target.replies = Array.isArray(target.replies) ? target.replies : [];
            target.replies.push({
              id: "rep-" + Date.now().toString(36),
              authorToken: getUserToken(),
              nick: getSavedNickname() || s.anonymousName,
              text: replyText,
              createdAt: Date.now()
            });
            safeStorageSet(STORAGE_KEYS.comments, comments);
            fbState.replyingToId = null;
            notifyToast(s.toastReplyPosted);
            renderCommunitySection();
          }
          return;
        }

        const delReplyBtn = e.target.closest("[data-del-reply]");
        if (delReplyBtn) {
          const rid = delReplyBtn.getAttribute("data-del-reply");
          const pid = delReplyBtn.getAttribute("data-parent-id");
          if (useRemoteComments(getConfig())) {
            const res = await postRemoteCommentAction({
              action: "deleteReply",
              commentId: pid,
              replyId: rid
            });
            if (!res.ok) {
              notifyRemoteFailure(res.status);
              return;
            }
            const target = fbState.remoteComments.find((x) => x.id === pid);
            if (target && Array.isArray(target.replies)) {
              target.replies = target.replies.filter((r) => r.id !== rid);
            }
            notifyToast(s.toastCommentDeleted);
            renderCommunitySection();
            return;
          }
          const myTok = getUserToken();
          const comments = safeStorageGet(STORAGE_KEYS.comments, []);
          const target = comments.find((x) => x.id === pid);
          if (target && Array.isArray(target.replies)) {
            target.replies = target.replies.filter(
              (r) => !(r.id === rid && r.authorToken === myTok)
            );
            safeStorageSet(STORAGE_KEYS.comments, comments);
            notifyToast(s.toastCommentDeleted);
            renderCommunitySection();
          }
          return;
        }

        const jumpToolBtn = e.target.closest("[data-jump-tool]");
        if (jumpToolBtn && fbState.deps && typeof fbState.deps.onOpenTool === "function") {
          const tid = sanitizeId(jumpToolBtn.getAttribute("data-jump-tool"));
          if (tid) fbState.deps.onOpenTool(tid);
        }
      });
    }

    // Developer Request tab handlers
    const reqForm = document.getElementById("devRequestForm");
    if (reqForm) {
      reqForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titleEl = document.getElementById("reqTitleInput");
        const detailsEl = document.getElementById("reqDetailsTextarea");
        const title = titleEl ? titleEl.value.trim() : "";
        const details = detailsEl ? detailsEl.value.trim() : "";

        if (!title || !details) {
          notifyToast(s.reqValidationError);
          if (!title && titleEl) titleEl.focus();
          else if (detailsEl) detailsEl.focus();
          return;
        }

        const submitBtn = document.getElementById("reqSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = s.reqSubmitting;
        }

        const result = await submitFeatureRequest({
          category: (document.getElementById("reqCategorySelect") || {}).value,
          toolId: (document.getElementById("reqToolSelect") || {}).value,
          priority: (document.getElementById("reqPrioritySelect") || {}).value,
          title,
          details,
          contact: (document.getElementById("reqContactInput") || {}).value,
          attachEnv: Boolean((document.getElementById("reqAttachEnvChk") || {}).checked),
          crossPost: Boolean((document.getElementById("reqCrossPostChk") || {}).checked)
        });

        notifyToast(getRequestSubmitToast(result, s));
        renderCommunitySection();
      });
    }

    const reqListEl = document.getElementById("fbRequestsList");
    if (reqListEl) {
      reqListEl.addEventListener("click", async (e) => {
        const copyBtn = e.target.closest("[data-copy-req]");
        if (copyBtn) {
          const id = copyBtn.getAttribute("data-copy-req");
          const item = safeStorageGet(STORAGE_KEYS.requests, []).find((r) => r.id === id);
          if (item) {
            try {
              await navigator.clipboard.writeText(buildRequestPlainText(item));
            } catch (err) {}
            notifyToast(s.reqTicketCopied);
          }
          return;
        }

        const delReqBtn = e.target.closest("[data-del-req]");
        if (delReqBtn) {
          const id = delReqBtn.getAttribute("data-del-req");
          const list = safeStorageGet(STORAGE_KEYS.requests, []).filter((r) => r.id !== id);
          safeStorageSet(STORAGE_KEYS.requests, list);
          notifyToast(s.toastCommentDeleted);
          renderCommunitySection();
        }
      });
    }
  }

  /* ==================== Floating Chat Assistant & Quick Request Drawer ==================== */

  function getChatHistory() {
    const history = safeStorageGet(STORAGE_KEYS.chat, null);
    if (Array.isArray(history) && history.length > 0) return history;
    const s = ft();
    return [
      {
        id: "bot-welcome",
        role: "bot",
        text: s.chatWelcome,
        createdAt: Date.now(),
        tools: [],
        offerRequest: false
      }
    ];
  }

  function saveChatHistory(list) {
    safeStorageSet(STORAGE_KEYS.chat, list.slice(-40));
  }

  function findMatchingTools(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/[\s,./!?]+/).filter((x) => x.length >= 2);
    const lang = fbState.deps ? fbState.deps.getLang() : "ko";
    const scored = [];

    (window.TOOLS_CATALOG || []).forEach((tool) => {
      const seoObj = window.TOOLS_SEO && window.TOOLS_SEO[tool.id];
      const seoKw = seoObj && seoObj[lang] ? seoObj[lang].keywords || "" : "";
      const corpus = [
        tool.id,
        tool.names.ko || "",
        tool.names.en || "",
        tool.names.ja || "",
        tool.names.es || "",
        tool.descs[lang] || "",
        tool.searchTags || "",
        seoKw
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;
      if (corpus.includes(q)) score += 6;
      tokens.forEach((tok) => {
        if (corpus.includes(tok)) score += 2;
      });
      if (score > 0) scored.push({ id: tool.id, score });
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map((x) => x.id);
  }

  function buildBotReply(userQuery) {
    const s = ft();
    const q = userQuery.trim().toLowerCase();

    const isRequestIntent = /(요청|추가|만들어|기능|버그|오류|에러|개선|건의|불편|안됨|안돼|안되|request|feature|missing|bug|error|broken|support|要望|機能|追加|バグ|エラー|solicitud|función)/i.test(q);
    const isPrivacyIntent = /(서버|보안|유출|안전|개인정보|저장|privacy|server|upload|safe|security|セキュリティ|サーバー|privacidad|seguro)/i.test(q);
    const isKbIntent = /(200kb|100kb|500kb|원서|이력서|용량)/i.test(q);
    const isHeicIntent = /(heic|heif|아이폰|iphone)/i.test(q);

    if (isPrivacyIntent && !isRequestIntent) {
      return { text: s.chatPrivacyReply, tools: [], offerRequest: false };
    }
    if (isKbIntent && !isRequestIntent) {
      return { text: s.chatKbReply, tools: ["compress-kb"], offerRequest: false };
    }
    if (isHeicIntent && !isRequestIntent) {
      return { text: s.chatHeicReply, tools: ["heic-to-jpg"], offerRequest: false };
    }

    const matchedTools = findMatchingTools(userQuery);
    if (!isRequestIntent && matchedTools.length > 0) {
      return {
        text: s.chatToolMatchPrefix,
        tools: matchedTools,
        offerRequest: true
      };
    }

    return {
      text: s.chatNoMatchText,
      tools: matchedTools,
      offerRequest: true
    };
  }

  function loadThirdPartyLiveChat() {
    const cfg = getConfig();
    if (!cfg.liveChat || fbState.liveChatLoaded) return false;
    if (cfg.liveChat.provider === "crisp" && cfg.liveChat.crispWebsiteId) {
      fbState.liveChatLoaded = true;
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = cfg.liveChat.crispWebsiteId;
      const d = document.createElement("script");
      d.src = "https://client.crisp.chat/l.js";
      d.async = true;
      document.head.appendChild(d);
      return true;
    }
    if (cfg.liveChat.provider === "tawk" && cfg.liveChat.tawkPropertyId) {
      fbState.liveChatLoaded = true;
      const s1 = document.createElement("script");
      s1.async = true;
      s1.src = `https://embed.tawk.to/${encodeURIComponent(cfg.liveChat.tawkPropertyId)}/${encodeURIComponent(cfg.liveChat.tawkWidgetId || "default")}`;
      s1.charset = "UTF-8";
      s1.setAttribute("crossorigin", "*");
      document.head.appendChild(s1);
      return true;
    }
    return false;
  }

  function renderChatWidget() {
    const root = document.getElementById("chatWidget");
    if (!root) return;
    const s = ft();
    const cfg = getConfig();
    const history = getChatHistory();
    const hasLiveChat =
      cfg.liveChat &&
      ((cfg.liveChat.provider === "crisp" && cfg.liveChat.crispWebsiteId) ||
        (cfg.liveChat.provider === "tawk" && cfg.liveChat.tawkPropertyId));

    const messagesHtml = history
      .map((msg) => {
        const isUser = msg.role === "user";
        const toolBtnsHtml =
          Array.isArray(msg.tools) && msg.tools.length > 0
            ? `<div class="chat-msg-actions">
                ${msg.tools
                  .map(
                    (tid) =>
                      `<button type="button" class="chat-action-pill primary" data-chat-open-tool="${escapeHtml(tid)}">${escapeHtml(getToolDisplayName(tid))} →</button>`
                  )
                  .join("")}
              </div>`
            : "";

        const reqBtnHtml = msg.offerRequest
          ? `<div class="chat-msg-actions">
              <button type="button" class="chat-action-pill" data-chat-prefill-req="${escapeHtml(msg.sourceQuery || "")}">${escapeHtml(s.chatSendAsReqBtn)}</button>
            </div>`
          : "";

        return `
          <div class="chat-msg ${isUser ? "user" : "bot"}">
            <div class="chat-bubble">
              <p>${escapeHtml(msg.text)}</p>
              ${toolBtnsHtml}
              ${reqBtnHtml}
            </div>
          </div>
        `;
      })
      .join("");

    const inlineReqHtml = `
      <form id="chatInlineReqForm" class="chat-inline-req" novalidate>
        <div class="chat-inline-head">
          <strong>${escapeHtml(s.chatInlineReqTitle)}</strong>
          <button type="button" class="fb-scope-link" id="chatBackBtn">${escapeHtml(s.chatBackToChat)}</button>
        </div>
        <select id="chatReqCategory" class="fb-select">
          <option value="newTool">${escapeHtml(s.reqCatNewTool)}</option>
          <option value="improve">${escapeHtml(s.reqCatImprove)}</option>
          <option value="bug">${escapeHtml(s.reqCatBug)}</option>
          <option value="ui">${escapeHtml(s.reqCatUi)}</option>
        </select>
        <input type="text" id="chatReqTitle" class="fb-input" maxlength="120" value="${escapeHtml(fbState.chatDraftTitle)}" placeholder="${escapeHtml(s.reqTitlePlaceholder)}" required />
        <textarea id="chatReqDetails" class="fb-textarea" rows="3" maxlength="2000" placeholder="${escapeHtml(s.reqDetailsPlaceholder)}" required></textarea>
        <input type="text" id="chatReqContact" class="fb-input" maxlength="120" placeholder="${escapeHtml(s.reqContactPlaceholder)}" />
        <label class="fb-check-label">
          <input type="checkbox" id="chatReqCrossPost" checked />
          <span>${escapeHtml(s.reqCrossPostLabel)}</span>
        </label>
        <button type="submit" id="chatReqSubmitBtn" class="fb-primary-btn" style="width:100%;">${escapeHtml(s.reqSubmitBtn)}</button>
      </form>
    `;

    root.innerHTML = `
      <div class="chat-panel${fbState.chatOpen ? " open" : ""}" id="chatPanel" role="dialog" aria-label="${escapeHtml(s.chatTitle)}">
        <div class="chat-header">
          <div class="chat-header-info">
            <span class="chat-status-dot"></span>
            <div>
              <strong>💬 ${escapeHtml(s.chatTitle)}</strong>
              <span>${escapeHtml(s.chatSubtitle)}</span>
            </div>
          </div>
          <div class="chat-header-btns">
            <button type="button" class="chat-hdr-btn" id="chatToggleReqBtn">${escapeHtml(s.chatOpenReqBtn)}</button>
            <button type="button" class="chat-hdr-btn" id="chatClearBtn" title="${escapeHtml(s.chatClearBtn)}">↺</button>
            <button type="button" class="chat-hdr-btn" id="chatCloseBtn" aria-label="Close">✕</button>
          </div>
        </div>

        ${
          fbState.chatInlineRequest
            ? `<div class="chat-body">${inlineReqHtml}</div>`
            : `
              <div class="chat-body" id="chatMessagesBody">
                ${messagesHtml}
              </div>
              <div class="chat-quick-chips">
                <button type="button" class="chat-chip" data-chip="req">${escapeHtml(s.chatChipReq)}</button>
                <button type="button" class="chat-chip" data-chip="comments">${escapeHtml(s.chatChipComments)}</button>
                <button type="button" class="chat-chip" data-chip="kb">${escapeHtml(s.chatChipKb)}</button>
                <button type="button" class="chat-chip" data-chip="privacy">${escapeHtml(s.chatChipPrivacy)}</button>
                <button type="button" class="chat-chip" data-chip="heic">${escapeHtml(s.chatChipHeic)}</button>
                ${hasLiveChat ? `<button type="button" class="chat-chip" data-chip="live">${escapeHtml(s.chatLiveAgentBtn)}</button>` : ""}
              </div>
              <form class="chat-input-bar" id="chatForm">
                <input type="text" id="chatInput" class="chat-input" maxlength="400" placeholder="${escapeHtml(s.chatInputPlaceholder)}" autocomplete="off" />
                <button type="submit" class="chat-send-btn">${escapeHtml(s.chatSendBtn)}</button>
              </form>
            `
        }
      </div>

      <button type="button" class="chat-fab" id="chatFabBtn" aria-expanded="${fbState.chatOpen ? "true" : "false"}">
        <span class="chat-fab-dot"></span>
        <span>💬 ${escapeHtml(s.chatFabLabel)}</span>
      </button>
    `;

    bindChatEvents(root);

    const msgBody = document.getElementById("chatMessagesBody");
    if (msgBody && fbState.chatOpen) {
      msgBody.scrollTop = msgBody.scrollHeight;
    }
  }

  function handleSendChatMessage(text) {
    const clean = String(text || "").trim();
    if (!clean) return;

    const history = getChatHistory();
    history.push({ id: "u-" + Date.now(), role: "user", text: clean, createdAt: Date.now() });

    const reply = buildBotReply(clean);
    history.push({
      id: "b-" + (Date.now() + 1),
      role: "bot",
      text: reply.text,
      tools: reply.tools,
      offerRequest: reply.offerRequest,
      sourceQuery: clean,
      createdAt: Date.now()
    });

    saveChatHistory(history);
    renderChatWidget();
  }

  function bindRootChatDelegation(root) {
    root.setAttribute("data-chat-bound", "1");
    root.addEventListener("click", (e) => {
      const chipBtn = e.target.closest("[data-chip]");
      if (chipBtn) {
        const chip = chipBtn.getAttribute("data-chip");
        if (chip === "req") {
          fbState.chatInlineRequest = true;
          fbState.chatDraftTitle = "";
          renderChatWidget();
          return;
        }
        if (chip === "comments") {
          fbState.chatOpen = false;
          fbState.activeTab = "comments";
          renderChatWidget();
          renderCommunitySection();
          const sec = document.getElementById("communitySection");
          if (sec) sec.scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (chip === "live") {
          loadThirdPartyLiveChat();
          return;
        }
        const sNow = ft();
        const chipQueryMap = {
          kb: sNow.chatChipKb,
          privacy: sNow.chatChipPrivacy,
          heic: sNow.chatChipHeic
        };
        if (chipQueryMap[chip]) {
          handleSendChatMessage(chipQueryMap[chip]);
        }
        return;
      }

      const openToolBtn = e.target.closest("[data-chat-open-tool]");
      if (openToolBtn && fbState.deps && typeof fbState.deps.onOpenTool === "function") {
        const tid = sanitizeId(openToolBtn.getAttribute("data-chat-open-tool"));
        if (tid) {
          fbState.chatOpen = false;
          renderChatWidget();
          fbState.deps.onOpenTool(tid);
        }
        return;
      }

      const prefillBtn = e.target.closest("[data-chat-prefill-req]");
      if (prefillBtn) {
        fbState.chatDraftTitle = (prefillBtn.getAttribute("data-chat-prefill-req") || "").slice(0, 120);
        fbState.chatInlineRequest = true;
        renderChatWidget();
      }
    });
  }

  function bindChatEvents(root) {
    const s = ft();

    if (!root.getAttribute("data-chat-bound")) {
      bindRootChatDelegation(root);
    }

    const fab = document.getElementById("chatFabBtn");
    if (fab) {
      fab.addEventListener("click", () => {
        fbState.chatOpen = !fbState.chatOpen;
        renderChatWidget();
        if (fbState.chatOpen) {
          const inp = document.getElementById("chatInput");
          if (inp) inp.focus();
        }
      });
    }

    const closeBtn = document.getElementById("chatCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        fbState.chatOpen = false;
        renderChatWidget();
      });
    }

    const toggleReqBtn = document.getElementById("chatToggleReqBtn");
    if (toggleReqBtn) {
      toggleReqBtn.addEventListener("click", () => {
        fbState.chatInlineRequest = !fbState.chatInlineRequest;
        fbState.chatDraftTitle = "";
        renderChatWidget();
      });
    }

    const backBtn = document.getElementById("chatBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        fbState.chatInlineRequest = false;
        renderChatWidget();
      });
    }

    const clearBtn = document.getElementById("chatClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.chat);
        } catch (e) {}
        fbState.chatInlineRequest = false;
        renderChatWidget();
      });
    }

    const chatForm = document.getElementById("chatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const inp = document.getElementById("chatInput");
        if (!inp || !inp.value.trim()) return;
        handleSendChatMessage(inp.value);
      });
    }

    const inlineForm = document.getElementById("chatInlineReqForm");
    if (inlineForm) {
      inlineForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titleEl = document.getElementById("chatReqTitle");
        const detailsEl = document.getElementById("chatReqDetails");
        const title = titleEl ? titleEl.value.trim() : "";
        const details = detailsEl ? detailsEl.value.trim() : "";
        if (!title || !details) {
          notifyToast(s.reqValidationError);
          return;
        }
        const btn = document.getElementById("chatReqSubmitBtn");
        if (btn) {
          btn.disabled = true;
          btn.textContent = s.reqSubmitting;
        }

        const result = await submitFeatureRequest({
          category: (document.getElementById("chatReqCategory") || {}).value,
          toolId: fbState.deps && fbState.deps.getToolId() ? fbState.deps.getToolId() : "all",
          priority: "high",
          title,
          details,
          contact: (document.getElementById("chatReqContact") || {}).value,
          attachEnv: true,
          crossPost: Boolean((document.getElementById("chatReqCrossPost") || {}).checked)
        });

        fbState.chatInlineRequest = false;
        fbState.chatDraftTitle = "";
        const history = getChatHistory();
        const chatReplyText = result.endpointError
          ? getRequestSubmitToast(result, s)
          : `${result.sentRemotely ? s.reqSubmittedSent : s.chatInlineSentMsg} (#${result.ticket.id})`;
        history.push({
          id: "b-req-" + Date.now(),
          role: "bot",
          text: chatReplyText,
          tools: [],
          offerRequest: false,
          createdAt: Date.now()
        });
        saveChatHistory(history);

        renderChatWidget();
        renderCommunitySection();
        notifyToast(getRequestSubmitToast(result, s));
      });
    }
  }

  function updateHeaderJumpBtn() {
    const btn = document.getElementById("jumpFeedbackBtn");
    if (!btn) return;
    btn.textContent = ft().navFeedbackBtn;
  }

  function init(deps) {
    fbState.deps = deps;
    updateHeaderJumpBtn();

    const jumpBtn = document.getElementById("jumpFeedbackBtn");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", () => {
        const sec = document.getElementById("communitySection");
        if (sec) sec.scrollIntoView({ behavior: "smooth" });
      });
    }

    renderCommunitySection();
    renderChatWidget();
    if (getCommentsApiUrl(getConfig()) && !hasValidGiscusConfig(getConfig())) {
      fetchRemoteComments();
    }
  }

  function syncLanguage() {
    updateHeaderJumpBtn();
    renderCommunitySection();
    renderChatWidget();
  }

  function syncTheme(theme) {
    const iframe = document.querySelector("iframe.giscus-frame");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { giscus: { setConfig: { theme: theme === "dark" ? "dark" : "light" } } },
        "https://giscus.app"
      );
    }
  }

  function setContext(toolId) {
    if (!toolId && fbState.filterScope === "current") {
      fbState.filterScope = "all";
    }
    renderCommunitySection();
  }

  window.FeedbackModule = {
    init,
    syncLanguage,
    syncTheme,
    setContext
  };
})();
