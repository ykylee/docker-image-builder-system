<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Login from "./routes/Login.svelte";
  import BuildsList from "./routes/BuildsList.svelte";
  import BuildDetail from "./routes/BuildDetail.svelte";
  // TASK-079 (skill 측 build request UI): BuildRequest 페이지는 일반
  // userId 로그인 직후 진입. admin 여부와 무관하게 모든 인증된 사용자가
  // 접근 가능 — skill 이 build 요청을 제출하는 흐름을 사용자가 직접 시험.
  import BuildRequest from "./routes/BuildRequest.svelte";
  // ApiConsole 은 Swagger UI iframe 임베드 페이지. OpenAPI contract 를 SPA
  // 컨텍스트 안에서 확인할 수 있게 함.
  import ApiConsole from "./routes/ApiConsole.svelte";
  import AdminBuilds from "./routes/AdminBuilds.svelte";
  import AdminUsers from "./routes/AdminUsers.svelte";
  import AdminAdmins from "./routes/AdminAdmins.svelte";
  import AdminRunners from "./routes/AdminRunners.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Login,
    "/builds": BuildsList,
    "/builds/:buildId": BuildDetail,
    // TASK-079: skill 측 build request UI 진입점. 일반 인증 사용자
    // (admin 여부 무관) 가 POST /builds payload 를 직접 작성해 lifecycle
    // 을 시험할 수 있는 페이지.
    "/build-request": BuildRequest,
    // API Console — Swagger UI 임베드. SPA 안에서 OpenAPI contract 를
    // navigable 하게 확인 가능.
    "/api-console": ApiConsole,
    // Admin routes (TASK-076). 별도 AdminLogin 단계가 없으므로 admin
    // 진입점은 일반 Login 과 동일 — userId 가 admin allow-list 에 들어
    // 있으면 Header 가 admin 메뉴를 자동 노출한다. 각 admin route 는
    // userId 부재 시 Login 페이지 (`/`) 로 redirect 하고, 미인가 요청은
    // backend 의 X-Admin-Id 401/403 으로 표면화된다.
    "/admin/builds": AdminBuilds,
    "/admin/users": AdminUsers,
    "/admin/admins": AdminAdmins,
    "/admin/runners": AdminRunners,
    "*": NotFound
  };
</script>

<Header />
<main>
  <Router {routes} />
</main>

<style>
  main {
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--space-lg) var(--space-xl);
  }
</style>
