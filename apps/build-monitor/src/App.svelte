<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Login from "./routes/Login.svelte";
  import BuildsList from "./routes/BuildsList.svelte";
  import BuildDetail from "./routes/BuildDetail.svelte";
  import AdminBuilds from "./routes/AdminBuilds.svelte";
  import AdminUsers from "./routes/AdminUsers.svelte";
  import AdminAdmins from "./routes/AdminAdmins.svelte";
  import AdminRunners from "./routes/AdminRunners.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Login,
    "/builds": BuildsList,
    "/builds/:buildId": BuildDetail,
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
