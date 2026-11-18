# 바른자금 Windows 서버 운영

서버 사본은 `D:\bareunfund\site`이고 관리자 주소는 서버에서 여는 `http://127.0.0.1:38571/#admin`이다. **연결·백업**에서 기존 관리자 키로 연결한 후 **원본 자료**에서 파일을 관리한다. 파일 정보 수정, 휴지통 이동 및 복원은 보관한 원본 바이트를 유지한다.

## 백업 및 복구 확인

서버의 `D:\bareunfund\site`에서 PowerShell로 실행한다.

```powershell
.\scripts\windows\backup-data.ps1
.\scripts\windows\restore-data.ps1 -Snapshot '<백업 결과에 표시된 snapshot 이름>'
```

백업에는 `.data`의 원본 파일, 목록, 학습 지식이 포함된다. 복구 명령은 체크섬을 검증하고 별도 폴더에 복구본을 만든다. 장애 복구로 해당 복사본을 서비스에 쓰려면 서버를 중지하고 데이터 폴더 교체를 별도로 진행한다. 관리자 키는 기존 `.env.local`에서 읽는다. 같은 디스크의 백업이므로 디스크 장애에 대비한 사본은 별도로 필요하다.

## 운영 실행

기존 개발 서버를 처음 운영용으로 전환할 때는 다음 명령을 사용한다. 먼저 현재 포트의 소유자를 확인한다. 전환 명령은 자료를 백업하고 빌드한 후 확인된 바른자금 개발 프로세스만 교체한다. 운영 서버가 이미 실행 중이면 현재 상태를 점검한다.

```powershell
.\scripts\windows\switch-production.ps1 -InspectOnly
.\scripts\windows\switch-production.ps1
```

운영 빌드에는 Node.js에서 `--env-file` 옵션을 쓸 수 있어야 한다. 현재 서버에서는 Node.js 24를 사용한다. 다음 명령은 기존 개발 서버와 별도의 폴더에 운영 버전을 빌드한다.

```powershell
.\scripts\windows\production.ps1 -Action Build
```

포트가 비어 있을 때 `production.ps1 -Action Start`로 실행한다. `production.ps1 -Action Check`는 홈페이지, 인증 없는 접근 차단, 인증된 문서 목록과 원본 인덱스의 일치를 확인한다. 데이터는 기존 `site\.data`에 보관한다.

재부팅 자동 실행용 `prepare-startup-task.ps1 -Account <전용계정>`은 기존 일반 로컬 계정에 대해 작업 정의 XML을 만든다. 등록 전에 이 계정의 사이트·관리자 키 읽기, 자료 및 필요한 실행 폴더 쓰기 권한을 검토한다. 등록은 Windows 작업 스케줄러에서 별도로 수행한다.

## 공유 사이트

게시한 학습 자료만 공유하려면 전용 HTTPS 주소의 `GET /api/knowledge`만 로컬 서버로 전달한다. 외부 주소에서 관리자 경로가 차단되는지 먼저 확인한다. 그런 다음 `public/server-connection.json`의 `publishedKnowledgeOrigin`에 HTTPS 원본 주소(경로와 끝 슬래시 제외)를 넣고 `npm run build:deploy`로 GitHub Pages 배포 파일을 생성한다. 값이 `null`이면 공유 사이트는 자체 자료로 상담한다. 원본 파일의 등록과 학습 지식의 게시는 별도 작업이다.
