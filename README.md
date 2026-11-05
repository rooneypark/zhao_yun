# 조운전 · 창술 연무장

## 오버로드 원본 리소스 연구실

처음 설치할 때는 [실행 리소스 릴리스](https://github.com/rooneypark/zhao_yun/releases/tag/overlord-assets-v1)에서 **overlord-maps.zip**과 **overlord-motion.zip**을 모두 받아 이 저장소의 최상위 폴더에 압축을 풉니다. 두 ZIP은 같은 `public/overlord/` 폴더 아래에 서로 다른 파일을 추가합니다. 압축을 푼 뒤 `run-overlord.bat`를 실행하세요.

`run-overlord.bat`를 실행하거나 개발 서버의 `/overlord.html`을 여세요. 맵의 원본 메시·지형·배치와 캐릭터의 원본 스킨·애니메이션을 검사하고, 장면 편집과 모션 재생 목록을 저장할 수 있습니다. 화면과 확보 범위는 [연구실 안내](src/overlord/README.md)에 설명되어 있습니다.

원본 설치 APK와 분할 리소스 팩은 `reference/overlord/apks`에, 추출·복호화·분석 근거는 `reference/overlord`에 보존합니다. `tools/overlord_acquire.py`는 복사와 ZIP CRC/SHA-256 검증을, `tools/overlord_scene_export.py`는 Unity 정적 배칭 범위를 반영한 장면 변환을 수행합니다. 변환기는 `tools/requirements-overlord.txt`의 Python 패키지를 사용합니다. `reference` 원본을 배포 서버로 올리지 않고 로컬에서 작업합니다.

아래의 기존 조운 연무장은 별도로 작성한 실시간 관절 모션을 사용하는 이전 화면입니다.

조운 한 명으로 평지에서 창술을 연습하는 Three.js 앱입니다. Windows에서 Node.js 22.12 이상을 설치한 뒤 `run-practice.bat`를 실행하면 브라우저가 열립니다. 터미널에서는 `npm ci`, `npm run dev`를 사용합니다. 배포용 정적 사이트는 `npm run build`로 생성합니다.

## 조작

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 및 공격 방향 선택 |
| J | 찌르기 → 가로베기 → 두 번 찌르기 → 역베기 → 연속 찌르기 → 회전베기 |
| F | 도약. 공중 J는 선회베기, K는 낙하 찍기 |
| K | 대기 중 용승창. 일반 공격 1~5타 도중 누르면 관통돌·천룡무·진천격·선풍창·창룡돌파로 분기 |
| U / O | 용아돌 / 창룡선풍. 재사용까지 각각 7초 / 14초 |
| I | 창룡난무. 연습용으로 기력 요구 없이 실행 |
| Space / L | 회피 |
| R / 마우스 휠 | 시작 위치로 초기화 / 확대·축소 |

달리며 J를 누르면 질주 횡소로 시작합니다. C1 → J는 회전 상승 후 낙참, C3 → J는 돌진 찌르기 후 공중 회전으로 이어집니다.

J와 K는 누른 횟수마다 한 번씩 입력됩니다. 공격 도중 다음 입력 한 개를 예약할 수 있고 기술별 연계 시점에 실행됩니다. 바닥에 나타나는 선·부채꼴·원은 빈 전장에서 타격 시점과 범위를 확인하기 위한 표시입니다.

## 구성

- `public/assets/hero`, `weapon` — 실행 시 불러오는 리깅 본체, 별도 창 GLB
- `source-art/models` — 고해상도 원본과 리깅 전 리토폴로지 모델
- `tripo-model-references-v2` — Tripo 입력용 조운·망토·창 기준 이미지
- `src/moves.js` — 삼국히어로즈 웹 프로토타입의 조운 전용 공격·차지·스킬·난무 데이터
- `src/main.js` — 입력 예약, 연계, 전진, 재사용 시간, 연무장 진행
- `src/rig.js` — 실시간 전신 포즈, 양손 그립, 다리 관절 풀이
- `src/arena.js` — 평지·조명·카메라, 창끝 궤적과 기술 범위 효과

기획 기준은 삼국히어로즈의 `docs/ZHAOYUN_ANIMATION_GUIDE.md`입니다. 타격 데이터는 원작의 미터 기준을 유지하고, 실제 리깅 모델의 크기에 맞춰 이동과 범위를 표시합니다. 런타임 포즈를 계산하는 방식으로, 별도의 FBX 애니메이션 클립은 필요하지 않습니다.

동작 참고: [조운 용창 커뮤니티 기술표](https://koeitecmo.wiki/wiki/Zhao_Yun_(Dynasty_Warriors)/Movesets), [용창 운용 분석](https://www.bilibili.com/read/cv22534134/). 이 프로젝트의 입력·기술 시간에 맞춰 별도로 작성한 실시간 관절 애니메이션입니다.

달리기 자세는 삼국히어로즈의 [양손 창 5방향 A·B 원화](source-art/motion/two-hand-run/preview.png)를 기준으로 합니다. 오른손은 골반 옆에서 창대를 밀고, 왼손은 가슴 앞에서 방향을 잡습니다. [측면 13컷](source-art/motion/two-hand-run/sequence-13.png)은 발을 밀고 접은 뒤 다시 딛는 박자에 사용했습니다. [원화·수정 전·수정 후 비교표](previews/run-grip-review.jpg)와 [방향 전환 비교 영상](previews/run-grip-comparison.mp4)에서 확인할 수 있습니다.
