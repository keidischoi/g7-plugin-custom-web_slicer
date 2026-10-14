# 🔪 웹 슬라이서 (custom-web_slicer)

회원 브라우저에서 STL · 3MF 를 슬라이스해 **내 프린터로 바로 보내는** 그누보드7(G7) 플러그인입니다.
모델은 서버로 올라가지 않습니다 (슬라이스는 회원 브라우저의 Web Worker 에서).

- 화면: `/slicer` (헤더 메뉴 「웹 슬라이서」)
- 엔진: [three-slicer](https://github.com/kimgh06/Three_Slicer) 0.3.4 — OrcaSlicer 를 WebAssembly 로 옮긴 것 (AGPL-3.0)
- 프린터 설정: 엔진에 들어 있는 OrcaSlicer 제조사 설정집 (프린터 · 품질 · 필라멘트)
- 보내기: 프린터 라운지(`custom-my_printer`)의 「📤 출력 파일 보내기」 API (`POST /api/plugins/custom-my_printer/printers/{id}/send-file`)

## 라이선스 (AGPL-3.0-or-later)

이 플러그인은 AGPL 엔진(three-slicer, OrcaSlicer 파생)을 회원 브라우저로 내려보내므로 **플러그인 전체를 AGPL-3.0-or-later 로 공개**합니다.
화면 아래에 소스 링크가 있습니다. 다른 확장과는 HTTP 주소로만 주고받고 코드를 가져다 쓰지 않습니다.

- `web/src/model-read.cjs` 는 같은 저작자의 출력 검사기(custom-print_check, MIT)의 계산 핵심을 가져온 것 — 여기서는 AGPL 로 함께 배포
- `dist/web/three-slicer-LICENSE.txt` · `three-slicer-NOTICES.txt` — 엔진의 라이선스 · 제3자 고지

## 하는 일

1. **모델 파일** — STL · 3MF · OBJ (ZIP64 3MF 포함). 물체마다 색이 다른 3MF 는 색마다 필라멘트(압출기) 하나로
   - 표면을 붓으로 칠한 다색(Bambu `paint_color`)은 아직 한 색으로 슬라이스 (다음 버전)
2. **프린터** — 프린터 라운지의 내 프린터를 고르면 같은 제조사 · 모델 설정을 찾아 줌 (0.4 노즐 먼저). 직접 고르기도 됨 (레진 제외)
3. **설정** — 품질(층 높이 설정집) · 필라멘트(이 프린터 추천 / 전체) · 채우기 % · 서포트(나무 · 자동) · 브림
4. **슬라이스** — 엔진은 이 화면을 열 때만 받음 (처음 한 번 수 MB). 여러 색이면 색 바꿈 · 프라임 타워 포함
5. **결과** — 예상 시간 · 무게(색마다) · 층 수
   - Bambu 프린터: `.gcode.3mf` (Bambu Studio 와 같은 꼴: `Metadata/plate_1.gcode` + md5 · `slice_info.config` · 미리 보기 그림 · 머리말 `HEADER_BLOCK`)
   - 그 밖: `.gcode`
   - **📤 내 프린터로 보내기** — 프린터 라운지가 보낼 수 있는 프린터일 때 (연결 프로그램 · 10분 안 소식). 「베드 비웠어요」를 체크해야 보냄. Bambu 는 AMS 칸을 색이 가장 비슷한 칸으로 자동으로 맞춤 (바꿀 수 있음)

## 알려진 한계

- 엔진은 OrcaSlicer 를 옮긴 작은 엔진이라 Bambu Studio · OrcaSlicer 와 결과가 조금 다를 수 있어요
- 여러 색일 때 엔진이 예상 시간을 주지 않아 G-code 로 어림 (「어림」 표시)
- 큰 모델(삼각형 수십만 개)은 휴대폰에서 메모리가 모자랄 수 있어요
- 휴대폰만으로 보내려면 프린터 라운지 연결 프로그램이 늘 켜진 기기(라즈베리파이 등)에 있어야 해요

## 개발

```bash
npm install          # esbuild · three-slicer (개발용 — node_modules 는 저장소에 없음)
npm run build        # web/src → dist/web (app.js · worker.js · c-<해시>.js · app.css)
php tests/run.php    # 구조 검사
node tests/web.test.mjs   # .gcode.3mf · md5 · zip · 시간 어림 검사
```

`dist/web` 은 저장소에 넣습니다 (설치 zip 이 빌드 없이 바로 쓰게).

## 설치

```bash
php82 artisan plugin:install custom-web_slicer
php82 artisan plugin:activate custom-web_slicer
```
