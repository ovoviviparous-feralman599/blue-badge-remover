# blue-badge-remover

X(트위터)에서 수익성 목적의 파란 뱃지 계정을 숨기는 크롬 익스텐션. 팔로우 중인 계정과 수동 화이트리스트는 예외 처리.

## 기능

- X 타임라인에서 수익성 파란 뱃지 계정의 트윗 자동 숨김
- 팔로우 중인 계정은 뱃지가 있어도 표시 (X 토큰 기반 동기화)
- 수동 화이트리스트로 특정 계정 예외 처리
- Popup UI에서 on/off 토글 및 설정 관리

## 기술 스택

- **Language**: TypeScript
- **Platform**: Chrome Extension (Manifest V3)
- **Build**: Vite + CRXJS
- **Test**: Vitest

## 설치 (개발)

```bash
# 의존성 설치
npm install

# 개발 모드 (HMR)
npm run dev

# 빌드
npm run build

# 테스트
npm run test
```

### 크롬에 로드

1. `chrome://extensions` 접속
2. "개발자 모드" 활성화
3. "압축 해제된 확장 프로그램을 로드합니다" 클릭
4. `dist/` 폴더 선택

## 프로젝트 구조

```
src/
├── background/              # Service Worker 진입점
├── content/                 # Content Script 진입점
├── popup/                   # Popup UI
├── features/
│   ├── badge-detection/     # 뱃지 감지
│   ├── content-filter/      # 콘텐츠 필터링
│   ├── follow-list/         # 팔로우 & 화이트리스트
│   └── settings/            # 설정 관리
└── shared/                  # 공통 타입, 유틸, 상수
```

## 문서

| 문서 | 내용 |
|------|------|
| `docs/ARCHITECTURE.md` | 아키텍처, 의존성 규칙 |
| `docs/REQUIREMENTS.md` | EARS 기반 요구사항 |
| `docs/CONVENTIONS.md` | 작업/커밋/PR 컨벤션 |
| `docs/CODE_REVIEW.md` | 코드 리뷰 규칙 |
| `docs/RELIABILITY.md` | 에러 처리 정책 |
| `docs/SECURITY.md` | 보안 정책 |
